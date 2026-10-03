// LLM service — FULLY OFFLINE.
//
// Both supported models are served locally by Ollama's OpenAI-compatible API
// (reached over an SSH tunnel). There are no cloud providers and no remote
// vLLM servers: if a model fails we fall back to the *other local model* only.
//
// NOTE: both models are REASONING models. Their OpenAI-compatible responses put
// the chain-of-thought in a `reasoning` field and the user-facing answer in
// `content`. We only ever read/emit `content`.

import type { ModelBackend } from './types'
import { MODEL_BACKENDS, DEFAULT_MODEL_BACKEND } from './types'

// Re-export the canonical type so existing `import { type ModelBackend } from './llm-service'`
// call sites keep working. The single source of truth is ./types.
export type { ModelBackend } from './types'

export interface ModelInfo {
  name: string
  type: string
  endpoint: string
  model: string
  description: string
  requiresTunnel: boolean
  tunnelCommand: string
}

/** Ollama's OpenAI-compatible chat endpoint, exposed locally by the SSH tunnel. */
const LOCAL_LLM_URL =
  process.env.LOCAL_LLM_URL || 'http://localhost:21434/v1/chat/completions'

/** Reasoning models spend a large part of their budget on `reasoning` tokens. */
const DEFAULT_MAX_TOKENS = Number(process.env.LOCAL_MAX_TOKENS) || 4000

/** Tunnel that must be up for the local endpoint to answer. */
const TUNNEL_COMMAND = 'ssh -N -L 21434:127.0.0.1:11434 <user>@<host>'

const REQUEST_TIMEOUT_MS = 300000 // 5 minutes — reasoning models are slow

export const MODEL_CONFIGS: Record<ModelBackend, ModelInfo> = {
  'local-nemotron': {
    name: "Nemotron 3.5 Lightning (30B)",
    type: "ollama",
    endpoint: LOCAL_LLM_URL,
    model: "nemotron-3.5-lightning:30b",
    description:
      "NVIDIA Nemotron 3.5 Lightning 30B — local reasoning model served by Ollama over an SSH tunnel (offline).",
    requiresTunnel: true,
    tunnelCommand: TUNNEL_COMMAND
  },
  'local-qwen': {
    name: "Qwen3.6 (35B-A3B)",
    type: "ollama",
    endpoint: LOCAL_LLM_URL,
    model: "qwen3.6:35b-a3b",
    description:
      "Qwen3.6 35B-A3B (MoE) — local reasoning model served by Ollama over an SSH tunnel (offline).",
    requiresTunnel: true,
    tunnelCommand: TUNNEL_COMMAND
  },
  'local-nano': {
    name: "Nemotron 3 Nano (4B)",
    type: "ollama",
    endpoint: LOCAL_LLM_URL,
    model: "nemotron-3-nano:4b",
    description:
      "NVIDIA Nemotron 3 Nano 4B — small, fastest local model served by Ollama over an SSH tunnel (offline).",
    requiresTunnel: true,
    tunnelCommand: TUNNEL_COMMAND
  }
}

export interface LLMResponse {
  response: string
  modelUsed: ModelBackend
  timeTaken: number // in milliseconds
  success: boolean
  error?: string
  modelInfo?: ModelInfo
}

export interface LLMStreamChunk {
  content: string
  done: boolean
  modelUsed?: ModelBackend
  error?: string
}

export interface LLMConfig {
  preferredBackend: ModelBackend
  systemPrompt: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

// ============================================================================
// HELPERS
// ============================================================================

/** Coerce anything (including a stale 'claude' preference) to a real backend. */
function resolveBackend(value: unknown): ModelBackend {
  return MODEL_BACKENDS.includes(value as ModelBackend)
    ? (value as ModelBackend)
    : DEFAULT_MODEL_BACKEND
}

/** Next local model to try — the only permitted fallback. Never a cloud service. */
function fallbackBackend(backend: ModelBackend): ModelBackend {
  const order = MODEL_BACKENDS.filter((b) => b !== backend)
  return order[0] ?? DEFAULT_MODEL_BACKEND
}

/**
 * Reasoning models burn tokens on the hidden `reasoning` field before they emit
 * any `content`, so a small caller-supplied budget yields an empty answer.
 * We therefore treat the configured budget as a FLOOR, not a ceiling.
 */
function resolveMaxTokens(requested?: number): number {
  return Math.max(DEFAULT_MAX_TOKENS, requested ?? 0)
}

function buildRequestBody(
  backend: ModelBackend,
  prompt: string,
  systemPrompt: string,
  config: Partial<LLMConfig> | undefined,
  stream: boolean
) {
  return JSON.stringify({
    model: MODEL_CONFIGS[backend].model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    temperature: config?.temperature ?? 0.7,
    max_tokens: resolveMaxTokens(config?.maxTokens),
    stream
  })
}

// ============================================================================
// NON-STREAMING
// ============================================================================

/**
 * Call one local model (non-streaming).
 *
 * Reasoning handling: we read ONLY `choices[0].message.content`. The model's
 * chain-of-thought lives in `choices[0].message.reasoning` and is discarded.
 * If the whole token budget went to reasoning, `content` comes back as "" —
 * that is a FAILURE, not an answer, so we surface a clear error instead of
 * returning an empty string to the caller.
 */
async function callLocalModel(
  backend: ModelBackend,
  prompt: string,
  systemPrompt: string,
  config?: Partial<LLMConfig>
): Promise<LLMResponse> {
  const startTime = Date.now()
  const modelConfig = MODEL_CONFIGS[backend]

  try {
    const response = await fetch(modelConfig.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildRequestBody(backend, prompt, systemPrompt, config, false),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(
        `Local model error (${modelConfig.model}): ${response.status} - ${errorData}`
      )
    }

    const data = await response.json()
    const message = data?.choices?.[0]?.message
    // Only `content` is the real answer; `message.reasoning` is chain-of-thought.
    const responseText: string = typeof message?.content === 'string' ? message.content : ''

    if (!responseText.trim()) {
      const finishReason = data?.choices?.[0]?.finish_reason ?? 'unknown'
      const reasoningLength =
        typeof message?.reasoning === 'string' ? message.reasoning.length : 0
      throw new Error(
        `Local model ${modelConfig.model} returned empty content ` +
          `(finish_reason=${finishReason}, reasoning chars=${reasoningLength}). ` +
          `The token budget was likely spent on reasoning — raise LOCAL_MAX_TOKENS ` +
          `(currently ${resolveMaxTokens(config?.maxTokens)}).`
      )
    }

    return {
      response: responseText,
      modelUsed: backend,
      timeTaken: Date.now() - startTime,
      success: true,
      modelInfo: modelConfig
    }
  } catch (error) {
    console.error(`[LLM Service] ${backend} error:`, error)
    return {
      response: '',
      modelUsed: backend,
      timeTaken: Date.now() - startTime,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      modelInfo: modelConfig
    }
  }
}

/**
 * Generate an LLM response with local-only fallback.
 *
 * Priority:
 * 1. Try the preferred local backend.
 * 2. If it fails (or returns empty content), try the OTHER local model.
 * 3. Surface a helpful error if both fail. Never falls back to a cloud service.
 *
 * `modelUsed` always names the backend that actually produced the text.
 */
export async function generateLLMResponse(
  prompt: string,
  config: LLMConfig
): Promise<LLMResponse> {
  const primary = resolveBackend(config.preferredBackend)
  const secondary = fallbackBackend(primary)

  console.log(`[LLM Service] Attempting with preferred backend: ${primary}`)

  let result = await callLocalModel(primary, prompt, config.systemPrompt, config)
  if (result.success) {
    console.log(`[LLM Service] ✅ ${primary} succeeded in ${result.timeTaken}ms`)
    return result
  }
  console.log(`[LLM Service] ❌ ${primary} failed: ${result.error}`)

  console.log(`[LLM Service] Falling back to ${secondary}...`)
  const fallbackResult = await callLocalModel(secondary, prompt, config.systemPrompt, config)
  if (fallbackResult.success) {
    console.log(`[LLM Service] ✅ ${secondary} succeeded in ${fallbackResult.timeTaken}ms`)
    return fallbackResult
  }
  console.log(`[LLM Service] ❌ ${secondary} failed: ${fallbackResult.error}`)

  return {
    response:
      "I'm unable to generate a response at this time. Both local models are unavailable — " +
      `check that the Ollama SSH tunnel is up (\`${TUNNEL_COMMAND}\`) and that ${LOCAL_LLM_URL} is reachable.`,
    modelUsed: primary,
    timeTaken: result.timeTaken + fallbackResult.timeTaken,
    success: false,
    error: `All local backends failed. ${primary}: ${result.error} | ${secondary}: ${fallbackResult.error}`,
    modelInfo: MODEL_CONFIGS[primary]
  }
}

// ============================================================================
// STREAMING
// ============================================================================

/**
 * Stream one local model over SSE.
 *
 * Reasoning handling: deltas arrive as `{delta: {content: "", reasoning: "..."}}`
 * FIRST and only later as `{delta: {content: "..."}}`. We yield ONLY `content`
 * and never leak `reasoning` to the caller. A stream that ends having produced
 * no content is reported as an error so the caller can fall back.
 */
async function* streamLocalModel(
  backend: ModelBackend,
  prompt: string,
  systemPrompt: string,
  config?: Partial<LLMConfig>
): AsyncGenerator<LLMStreamChunk> {
  const modelConfig = MODEL_CONFIGS[backend]
  let emittedContent = false

  try {
    const response = await fetch(modelConfig.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildRequestBody(backend, prompt, systemPrompt, config, true),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })

    if (!response.ok) {
      const errorData = await response.text()
      yield {
        content: '',
        done: true,
        error: `Local model error (${modelConfig.model}): ${response.status} - ${errorData}`,
        modelUsed: backend
      }
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      yield { content: '', done: true, error: 'No response stream', modelUsed: backend }
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // keep the incomplete line

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line || !line.startsWith('data:')) continue

        const data = line.slice(5).trim()
        if (data === '[DONE]') {
          if (!emittedContent) break
          yield { content: '', done: true, modelUsed: backend }
          return
        }

        try {
          const parsed = JSON.parse(data)
          const delta = parsed?.choices?.[0]?.delta
          // `delta.reasoning` is chain-of-thought — deliberately ignored.
          const content = typeof delta?.content === 'string' ? delta.content : ''
          if (content) {
            emittedContent = true
            yield { content, done: false, modelUsed: backend }
          }
        } catch {
          // Skip malformed SSE payloads
        }
      }
    }

    if (!emittedContent) {
      yield {
        content: '',
        done: true,
        error:
          `Local model ${modelConfig.model} streamed only reasoning and no content. ` +
          `Raise LOCAL_MAX_TOKENS (currently ${resolveMaxTokens(config?.maxTokens)}).`,
        modelUsed: backend
      }
      return
    }

    yield { content: '', done: true, modelUsed: backend }
  } catch (error) {
    console.error(`[LLM Service] ${backend} streaming error:`, error)
    yield {
      content: '',
      done: true,
      error: error instanceof Error ? error.message : String(error),
      modelUsed: backend
    }
  }
}

/**
 * Generate a streaming LLM response, falling back to the other LOCAL model.
 * Fallback only happens before any content has been emitted, so the caller
 * never sees two interleaved answers.
 */
export async function* generateLLMStreamingResponse(
  prompt: string,
  config: LLMConfig
): AsyncGenerator<LLMStreamChunk> {
  const primary = resolveBackend(config.preferredBackend)
  const secondary = fallbackBackend(primary)

  console.log(`[LLM Service] Streaming with preferred backend: ${primary}`)

  let hasSuccess = false

  for await (const chunk of streamLocalModel(primary, prompt, config.systemPrompt, config)) {
    if (chunk.error) {
      console.log(`[LLM Service] ❌ ${primary} streaming failed: ${chunk.error}`)
      if (hasSuccess) {
        // Already streamed part of an answer — surface the error, don't restart.
        yield chunk
        return
      }
      break
    }
    if (chunk.content) hasSuccess = true
    yield chunk
    if (chunk.done) return
  }

  if (!hasSuccess) {
    console.log(`[LLM Service] Falling back to ${secondary}...`)
    for await (const chunk of streamLocalModel(secondary, prompt, config.systemPrompt, config)) {
      if (chunk.error) {
        console.log(`[LLM Service] ❌ ${secondary} streaming failed: ${chunk.error}`)
        if (hasSuccess) {
          yield chunk
          return
        }
        break
      }
      if (chunk.content) hasSuccess = true
      yield chunk
      if (chunk.done) return
    }
  }

  if (!hasSuccess) {
    yield {
      content:
        "I'm unable to generate a response at this time. Both local models are unavailable — " +
        `check that the Ollama SSH tunnel is up (\`${TUNNEL_COMMAND}\`) and that ${LOCAL_LLM_URL} is reachable.`,
      done: true,
      error: 'All local backends failed',
      modelUsed: primary
    }
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get friendly display name for model backend
 */
export function getModelDisplayName(backend: ModelBackend): string {
  const config = MODEL_CONFIGS[backend]
  return config ? config.name : 'Unknown'
}

/**
 * Format time taken in a user-friendly way
 */
export function formatTimeTaken(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  } else {
    return `${(ms / 1000).toFixed(2)}s`
  }
}
