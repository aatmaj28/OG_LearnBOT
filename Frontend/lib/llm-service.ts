// Stream generators for different model backends

// vLLM stream generator
async function* streamVLLM(prompt: string, systemPrompt: string, config?: Partial<LLMConfig>) {
  const modelConfig = MODEL_CONFIGS['remote-blackwell']
  
  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ]

    const response = await fetch(modelConfig.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelConfig.model,
        messages: messages,
        temperature: config?.temperature || 0.7,
        max_tokens: config?.maxTokens || 2048,
        stream: true
      }),
      signal: AbortSignal.timeout(120000)
    })

    if (!response.ok) {
      yield { 
        content: '', 
        done: true, 
        error: `vLLM error: ${response.status}`, 
        modelUsed: REMOTE_BLACKWELL_BACKEND
      }
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      yield { 
        content: '', 
        done: true, 
        error: 'No response stream', 
        modelUsed: REMOTE_BLACKWELL_BACKEND
      }
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      
      if (done) {
        yield { content: '', done: true, modelUsed: REMOTE_BLACKWELL_BACKEND }
        break
      }

      buffer += decoder.decode(value, { stream: true })
      
      // Process complete lines from the buffer
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          const parsed = JSON.parse(line)
          const text = parsed.choices?.[0]?.delta?.content || ''
          if (text) {
            yield { content: text, done: false, modelUsed: REMOTE_BLACKWELL_BACKEND }
          }
        }
      }
    }
  } catch (error) {
    console.error('vLLM stream error:', error)
    yield { 
      content: '', 
      done: true, 
      error: String(error), 
      modelUsed: REMOTE_BLACKWELL_BACKEND
    }
  }
}
// Supports Claude API and Remote Blackwell (vLLM)

export type ModelBackend = 'claude' | 'remote-blackwell'

export interface ModelInfo {
  name: string
  type: string
  endpoint: string
  model: string
  description: string
  requiresTunnel: boolean
  tunnelCommand: string
}

export const MODEL_CONFIGS: Record<ModelBackend, ModelInfo> = {
  'claude': {
    name: "Claude",
    type: "claude",
    endpoint: "https://api.anthropic.com/v1/messages",
    model: "claude-haiku-4-5-20251001",
    description: "Anthropic Claude - Fast, instruction-tuned endpoint",
    requiresTunnel: false,
    tunnelCommand: ""
  },
  'remote-blackwell': {
    name: "Gemma (Blackwell)",
    type: "vllm",
    endpoint: "http://129.10.224.226:8000/v1/chat/completions",
    model: "google/gemma-3-12b-it",
    description: "vLLM on NVIDIA RTX 6000 Blackwell (96GB VRAM)",
    requiresTunnel: true,
    tunnelCommand: "ssh -L 8001:localhost:8000 ra_aatmaj@129.10.224.226"
  }
}

const CLAUDE_MODEL_ID = process.env.CLAUDE_MODEL_ID || MODEL_CONFIGS['claude'].model
const CLAUDE_BACKEND: ModelBackend = 'claude'
const REMOTE_BLACKWELL_BACKEND: ModelBackend = 'remote-blackwell'

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

// Claude API call
async function callClaude(prompt: string, systemPrompt: string, config?: Partial<LLMConfig>): Promise<LLMResponse> {
  const startTime = Date.now()
  
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    
    if (!apiKey || apiKey.includes('your-anthropic-api-key')) {
      throw new Error('Anthropic API key not configured')
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL_ID,
        max_tokens: config?.maxTokens ?? 1024,
        system: systemPrompt,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: config?.temperature ?? 0.7
      })
    })

    const endTime = Date.now()

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`Claude API error: ${response.status} - ${errorData}`)
    }

    const data = await response.json()
    const responseText = data.content?.[0]?.text || ''

    return {
      response: responseText,
      modelUsed: CLAUDE_BACKEND,
      timeTaken: endTime - startTime,
      success: true
    }
  } catch (error) {
    const endTime = Date.now()
    console.error('Claude API error:', error)
    return {
      response: '',
      modelUsed: CLAUDE_BACKEND,
      timeTaken: endTime - startTime,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

// Remote Ollama API call (via SSH tunnel)
async function callRemoteOllama(prompt: string, systemPrompt: string, config?: Partial<LLMConfig>): Promise<LLMResponse> {
  const startTime = Date.now()
  
  try {
    const remoteUrl = process.env.REMOTE_OLLAMA_URL || 'http://localhost:5001/api/generate'
    const remoteModel = process.env.REMOTE_OLLAMA_MODEL || 'gemma3:27b'

    const fullPrompt = `${systemPrompt}\n\n${prompt}`

    const response = await fetch(remoteUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: remoteModel,
        prompt: fullPrompt,
        stream: false,
        options: {
          temperature: config?.temperature ?? 0.2,
          top_p: 0.95,
          top_k: 40
        }
      }),
      signal: AbortSignal.timeout(120000) // 2 minute timeout
    })

    const endTime = Date.now()

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`Remote Ollama error: ${response.status} - ${errorData}`)
    }

    const data = await response.json()
    const responseText = data.response || ''

    return {
      response: responseText,
      modelUsed: REMOTE_BLACKWELL_BACKEND,
      timeTaken: endTime - startTime,
      success: true,
      modelInfo: MODEL_CONFIGS['remote-blackwell']
    }
  } catch (error) {
    const endTime = Date.now()
    console.error('Remote Ollama error:', error)
    return {
      response: '',
      modelUsed: REMOTE_BLACKWELL_BACKEND,
      timeTaken: endTime - startTime,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

// vLLM API call for Blackwell
async function callVLLM(prompt: string, systemPrompt: string, config?: Partial<LLMConfig>): Promise<LLMResponse> {
  const startTime = Date.now()
  const modelConfig = MODEL_CONFIGS['remote-blackwell']
  
  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ]

    const response = await fetch(modelConfig.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelConfig.model,
        messages: messages,
        temperature: config?.temperature || 0.7,
        max_tokens: config?.maxTokens || 2048,
        stream: false
      }),
      signal: AbortSignal.timeout(120000) // 2 minute timeout
    })

    if (!response.ok) {
      const errorData = await response.text()
      console.error(`[LLM Service] Blackwell vLLM error ${response.status}:`, errorData)
      console.error(`[LLM Service] Request URL: ${modelConfig.endpoint}`)
      console.error(`[LLM Service] Request body:`, JSON.stringify({ model: modelConfig.model, messages: messages.slice(0, 1) }, null, 2))
      throw new Error(`vLLM error: ${response.status} - ${errorData}`)
    }

    const data = await response.json()
    const responseText = data.choices[0]?.message?.content || ''

    return {
      response: responseText,
      modelUsed: REMOTE_BLACKWELL_BACKEND,
      timeTaken: Date.now() - startTime,
      success: true,
      modelInfo: modelConfig
    }
  } catch (error) {
    console.error('vLLM error:', error)
    return {
      response: '',
      modelUsed: REMOTE_BLACKWELL_BACKEND,
      timeTaken: Date.now() - startTime,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      modelInfo: modelConfig
    }
  }
}

/**
 * Generate LLM response with fallback mechanism
 * 
 * Priority:
 * 1. Try preferred backend
 * 2. If fails, try the remaining remote backends (Claude ⇄ Remote Ollama ⇄ Blackwell)
 * 3. Surface a helpful error if all fail
 * 
 * @param prompt - The user's prompt/question
 * @param config - Configuration including preferred backend and system prompt
 * @returns LLMResponse with response text, model used, and timing
 */
export async function generateLLMResponse(
  prompt: string,
  config: LLMConfig
): Promise<LLMResponse> {
  console.log(`[LLM Service] Attempting with preferred backend: ${config.preferredBackend}`)

  // Try preferred backend first
  let result: LLMResponse = { response: '', modelUsed: config.preferredBackend, timeTaken: 0, success: false, error: '' }
  
  if (config.preferredBackend === 'claude') {
    result = await callClaude(prompt, config.systemPrompt, config)
    if (result.success) {
      console.log(`[LLM Service] ✅ Claude succeeded in ${result.timeTaken}ms`)
      return result
    }
    console.log(`[LLM Service] ❌ Claude failed: ${result.error}`)
    
    // Fallback to Blackwell
    console.log('[LLM Service] Falling back to Blackwell...')
    result = await callVLLM(prompt, config.systemPrompt, config)
    if (result.success) {
      console.log(`[LLM Service] ✅ Blackwell succeeded in ${result.timeTaken}ms`)
      return result
    }
    console.log(`[LLM Service] ❌ Blackwell failed: ${result.error}`)
    
  } else if (config.preferredBackend === 'remote-blackwell') {
    result = await callVLLM(prompt, config.systemPrompt, config)
    if (result.success) {
      console.log(`[LLM Service] ✅ Blackwell succeeded in ${result.timeTaken}ms`)
      return result
    }
    console.log(`[LLM Service] ❌ Blackwell failed: ${result.error}`)
    
    // Fallback to Claude
    console.log('[LLM Service] Falling back to Claude...')
    result = await callClaude(prompt, config.systemPrompt, config)
    if (result.success) {
      console.log(`[LLM Service] ✅ Claude succeeded in ${result.timeTaken}ms`)
      return result
    }
    console.log(`[LLM Service] ❌ Claude failed: ${result.error}`)
  }

  // All backends failed
  return {
    response: "I'm unable to generate a response at this time. Please check that at least one LLM backend is available (Claude API key or Blackwell tunnel active).",
    modelUsed: config.preferredBackend,
    timeTaken: result?.timeTaken || 0,
    success: false,
    error: 'All backends failed'
  }
}

// ============================================================================
// STREAMING FUNCTIONS
// ============================================================================

/**
 * Stream response from Claude API with SSE
 */
async function* streamClaude(
  prompt: string,
  systemPrompt: string,
  config?: Partial<LLMConfig>
): AsyncGenerator<LLMStreamChunk> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    
    if (!apiKey || apiKey.includes('your-anthropic-api-key')) {
      yield { content: '', done: true, error: 'Anthropic API key not configured', modelUsed: CLAUDE_BACKEND }
      return
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL_ID,
        max_tokens: config?.maxTokens ?? 1024,
        system: systemPrompt,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: config?.temperature ?? 0.7,
        stream: true
      })
    })

    if (!response.ok) {
      const errorData = await response.text()
      yield { content: '', done: true, error: `Claude error: ${response.status}`, modelUsed: CLAUDE_BACKEND }
      return
    }

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) {
      yield { content: '', done: true, error: 'No response stream', modelUsed: CLAUDE_BACKEND }
      return
    }

    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.trim() && line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') {
            yield { content: '', done: true, modelUsed: CLAUDE_BACKEND }
            return
          }

          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
              const content = parsed.delta.text || ''
              if (content) {
              yield { content, done: false, modelUsed: CLAUDE_BACKEND }
              }
            } else if (parsed.type === 'message_stop') {
              yield { content: '', done: true, modelUsed: CLAUDE_BACKEND }
              return
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    yield { content: '', done: true, modelUsed: CLAUDE_BACKEND }
  } catch (error) {
    console.error('Claude streaming error:', error)
    yield { content: '', done: true, error: String(error), modelUsed: CLAUDE_BACKEND }
  }
}

/**
 * Stream response from Remote Ollama
 */
async function* streamRemoteOllama(
  prompt: string,
  systemPrompt: string,
  config?: Partial<LLMConfig>
): AsyncGenerator<LLMStreamChunk> {
  try {
    const remoteUrl = process.env.REMOTE_OLLAMA_URL || 'http://localhost:5001/api/generate'
    const remoteModel = process.env.REMOTE_OLLAMA_MODEL || 'gemma3:27b'
    const fullPrompt = `${systemPrompt}\n\n${prompt}`

    const response = await fetch(remoteUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: remoteModel,
        prompt: fullPrompt,
        stream: true,
        options: {
          temperature: config?.temperature ?? 0.2,
          top_p: 0.95,
          top_k: 40
        }
      })
    })

    if (!response.ok) {
      yield { content: '', done: true, error: `Remote A6000 error: ${response.status}`, modelUsed: REMOTE_BLACKWELL_BACKEND }
      return
    }

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) {
      yield { content: '', done: true, error: 'No response stream', modelUsed: REMOTE_BLACKWELL_BACKEND }
      return
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n').filter(line => line.trim() !== '')

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          if (parsed.response) {
            yield { content: parsed.response, done: false, modelUsed: REMOTE_BLACKWELL_BACKEND }
          }
          if (parsed.done) {
            yield { content: '', done: true, modelUsed: REMOTE_BLACKWELL_BACKEND }
            return
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }

    yield { content: '', done: true, modelUsed: REMOTE_BLACKWELL_BACKEND }
  } catch (error) {
    console.error('Remote A6000 streaming error:', error)
    yield { content: '', done: true, error: String(error), modelUsed: REMOTE_BLACKWELL_BACKEND }
  }
}

/**
 * Generate streaming LLM response with fallback
 */
export async function* generateLLMStreamingResponse(
  prompt: string,
  config: LLMConfig
): AsyncGenerator<LLMStreamChunk> {
  console.log(`[LLM Service] Streaming with preferred backend: ${config.preferredBackend}`)

  let hasSuccess = false

  // Try preferred backend first
  if (config.preferredBackend === 'claude') {
    for await (const chunk of streamClaude(prompt, config.systemPrompt, config)) {
      if (chunk.error) {
        console.log(`[LLM Service] ❌ Claude streaming failed: ${chunk.error}`)
        break
      }
      hasSuccess = true
      yield chunk
      if (chunk.done) return
    }

    if (!hasSuccess) {
      console.log('[LLM Service] Falling back to Blackwell...')
      for await (const chunk of streamVLLM(prompt, config.systemPrompt, config)) {
        if (chunk.error) {
          console.log(`[LLM Service] ❌ Blackwell streaming failed: ${chunk.error}`)
          break
        }
        hasSuccess = true
        yield chunk
        if (chunk.done) return
      }
    }
  } else if (config.preferredBackend === 'remote-blackwell') {
    for await (const chunk of streamVLLM(prompt, config.systemPrompt, config)) {
      if (chunk.error) {
        console.log(`[LLM Service] ❌ Blackwell streaming failed: ${chunk.error}`)
        break
      }
      hasSuccess = true
      yield chunk
      if (chunk.done) return
    }

    if (!hasSuccess) {
      console.log('[LLM Service] Falling back to Claude...')
      for await (const chunk of streamClaude(prompt, config.systemPrompt, config)) {
        if (chunk.error) {
          console.log(`[LLM Service] ❌ Claude streaming failed: ${chunk.error}`)
          break
        }
        hasSuccess = true
        yield chunk
        if (chunk.done) return
      }
    }
  }

  // If all failed
  if (!hasSuccess) {
    yield {
      content: "I'm unable to generate a response at this time. Please check that at least one LLM backend is available (Claude API key or Blackwell tunnel).",
      done: true,
      error: 'All backends failed',
      modelUsed: config.preferredBackend
    }
  }
}

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

