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
        modelUsed: 'remote-blackwell'
      }
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      yield { 
        content: '', 
        done: true, 
        error: 'No response stream', 
        modelUsed: 'remote-blackwell'
      }
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      
      if (done) {
        yield { content: '', done: true, modelUsed: 'remote-blackwell' }
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
            yield { content: text, done: false, modelUsed: 'remote-blackwell' }
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
      modelUsed: 'remote-blackwell'
    }
  }
}
// Supports Claude API, Remote A6000 (Ollama), and Remote Blackwell (vLLM)

export type ModelBackend = 'claude' | 'remote-a6000' | 'remote-blackwell'

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
    name: "Claude 3.5 Sonnet",
    type: "claude",
    endpoint: "https://api.anthropic.com/v1/messages",
    model: "claude-sonnet-4-20250514",
    description: "Anthropic's Claude 3.5 Sonnet - Best model for reasoning and instruction following",
    requiresTunnel: false,
    tunnelCommand: ""
  },
  'remote-a6000': {
    name: "Remote A6000 (Gemma 27B)",
    type: "ollama",
    endpoint: "http://localhost:5001/api/generate",
    model: "gemma3:27b",
    description: "Ollama on NVIDIA RTX A6000 (48GB VRAM)",
    requiresTunnel: true,
    tunnelCommand: "ssh -L 5001:localhost:11434 ra_aatmaj@129.10.156.97"
  },
  'remote-blackwell': {
    name: "Remote Blackwell (Gemma 12B)",
    type: "vllm",
    endpoint: "http://localhost:8001/v1/chat/completions",
    model: "google/gemma-3-12b-it",
    description: "vLLM on NVIDIA RTX 6000 Blackwell (96GB VRAM) - 2x faster",
    requiresTunnel: true,
    tunnelCommand: "ssh -L 8001:localhost:8000 ra_aatmaj@129.10.156.97"
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
        model: 'claude-sonnet-4-20250514',
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
      modelUsed: 'claude',
      timeTaken: endTime - startTime,
      success: true
    }
  } catch (error) {
    const endTime = Date.now()
    console.error('Claude API error:', error)
    return {
      response: '',
      modelUsed: 'claude',
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
      modelUsed: 'remote-a6000',
      timeTaken: endTime - startTime,
      success: true,
      modelInfo: MODEL_CONFIGS['remote-a6000']
    }
  } catch (error) {
    const endTime = Date.now()
    console.error('Remote Ollama error:', error)
    return {
      response: '',
      modelUsed: 'remote-a6000',
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
      throw new Error(`vLLM error: ${response.status} - ${errorData}`)
    }

    const data = await response.json()
    const responseText = data.choices[0]?.message?.content || ''

    return {
      response: responseText,
      modelUsed: 'remote-blackwell',
      timeTaken: Date.now() - startTime,
      success: true,
      modelInfo: modelConfig
    }
  } catch (error) {
    console.error('vLLM error:', error)
    return {
      response: '',
      modelUsed: 'remote-blackwell',
      timeTaken: Date.now() - startTime,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      modelInfo: modelConfig
    }
  }
}

// Local Ollama API call
async function callLocalOllama(prompt: string, systemPrompt: string, config?: Partial<LLMConfig>): Promise<LLMResponse> {
  const startTime = Date.now()
  
  try {
    const localUrl = process.env.LOCAL_OLLAMA_URL || 'http://localhost:11434'
    const localModel = process.env.LOCAL_OLLAMA_MODEL || 'llama3.1:8b'

    const fullPrompt = `${systemPrompt}\n\n${prompt}`

    const response = await fetch(`${localUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: localModel,
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
      throw new Error(`Local Ollama error: ${response.status} - ${errorData}`)
    }

    const data = await response.json()
    const responseText = data.response || ''

    return {
      response: responseText,
      modelUsed: 'local-ollama',
      timeTaken: endTime - startTime,
      success: true
    }
  } catch (error) {
    const endTime = Date.now()
    console.error('Local Ollama error:', error)
    return {
      response: '',
      modelUsed: 'local-ollama',
      timeTaken: endTime - startTime,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * Generate LLM response with fallback mechanism
 * 
 * Priority:
 * 1. Try preferred backend
 * 2. If fails, try the other backend (Claude <-> Remote Ollama)
 * 3. If both fail, try local Ollama
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
  let result: LLMResponse
  
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
    
    // Fallback to A6000
    console.log('[LLM Service] Falling back to A6000...')
    result = await callRemoteOllama(prompt, config.systemPrompt, config)
    if (result.success) {
      console.log(`[LLM Service] ✅ A6000 succeeded in ${result.timeTaken}ms`)
      return result
    }
    console.log(`[LLM Service] ❌ A6000 failed: ${result.error}`)
    
  } else if (config.preferredBackend === 'remote-blackwell') {
    result = await callVLLM(prompt, config.systemPrompt, config)
    if (result.success) {
      console.log(`[LLM Service] ✅ Blackwell succeeded in ${result.timeTaken}ms`)
      return result
    }
    console.log(`[LLM Service] ❌ Blackwell failed: ${result.error}`)
    
    // Fallback to A6000
    console.log('[LLM Service] Falling back to A6000...')
    result = await callRemoteOllama(prompt, config.systemPrompt, config)
    if (result.success) {
      console.log(`[LLM Service] ✅ A6000 succeeded in ${result.timeTaken}ms`)
      return result
    }
    console.log(`[LLM Service] ❌ A6000 failed: ${result.error}`)
    
    // Fallback to Claude
    console.log('[LLM Service] Falling back to Claude...')
    result = await callClaude(prompt, config.systemPrompt, config)
    if (result.success) {
      console.log(`[LLM Service] ✅ Claude succeeded in ${result.timeTaken}ms`)
      return result
    }
    console.log(`[LLM Service] ❌ Claude failed: ${result.error}`)
    
  } else {
    // Remote A6000
    result = await callRemoteOllama(prompt, config.systemPrompt, config)
    if (result.success) {
      console.log(`[LLM Service] ✅ A6000 succeeded in ${result.timeTaken}ms`)
      return result
    }
    console.log(`[LLM Service] ❌ A6000 failed: ${result.error}`)
    
    // Fallback to Blackwell
    console.log('[LLM Service] Falling back to Blackwell...')
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
    response: "I'm unable to generate a response at this time. Please check that at least one LLM backend is available (Claude API key, A6000, or Blackwell tunnel active).",
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
      yield { content: '', done: true, error: 'Anthropic API key not configured', modelUsed: 'claude' }
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
        model: 'claude-sonnet-4-20250514',
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
      yield { content: '', done: true, error: `Claude error: ${response.status}`, modelUsed: 'claude' }
      return
    }

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) {
      yield { content: '', done: true, error: 'No response stream', modelUsed: 'claude' }
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
            yield { content: '', done: true, modelUsed: 'claude' }
            return
          }

          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
              const content = parsed.delta.text || ''
              if (content) {
                yield { content, done: false, modelUsed: 'claude' }
              }
            } else if (parsed.type === 'message_stop') {
              yield { content: '', done: true, modelUsed: 'claude' }
              return
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    yield { content: '', done: true, modelUsed: 'claude' }
  } catch (error) {
    console.error('Claude streaming error:', error)
    yield { content: '', done: true, error: String(error), modelUsed: 'claude' }
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
      yield { content: '', done: true, error: `Remote A6000 error: ${response.status}`, modelUsed: 'remote-a6000' }
      return
    }

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) {
      yield { content: '', done: true, error: 'No response stream', modelUsed: 'remote-a6000' }
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
            yield { content: parsed.response, done: false, modelUsed: 'remote-a6000' }
          }
          if (parsed.done) {
            yield { content: '', done: true, modelUsed: 'remote-a6000' }
            return
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }

    yield { content: '', done: true, modelUsed: 'remote-a6000' }
  } catch (error) {
    console.error('Remote A6000 streaming error:', error)
    yield { content: '', done: true, error: String(error), modelUsed: 'remote-a6000' }
  }
}

/**
 * Stream response from Local Ollama
 */
async function* streamLocalOllama(
  prompt: string,
  systemPrompt: string,
  config?: Partial<LLMConfig>
): AsyncGenerator<LLMStreamChunk> {
  try {
    const localUrl = process.env.LOCAL_OLLAMA_URL || 'http://localhost:11434'
    const localModel = process.env.LOCAL_OLLAMA_MODEL || 'llama3.1:8b'
    const fullPrompt = `${systemPrompt}\n\n${prompt}`

    const response = await fetch(`${localUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: localModel,
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
      yield { content: '', done: true, error: `Local Ollama error: ${response.status}`, modelUsed: 'local-ollama' }
      return
    }

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) {
      yield { content: '', done: true, error: 'No response stream', modelUsed: 'local-ollama' }
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
            yield { content: parsed.response, done: false, modelUsed: 'local-ollama' }
          }
          if (parsed.done) {
            yield { content: '', done: true, modelUsed: 'local-ollama' }
            return
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }

    yield { content: '', done: true, modelUsed: 'local-ollama' }
  } catch (error) {
    console.error('Local Ollama streaming error:', error)
    yield { content: '', done: true, error: String(error), modelUsed: 'local-ollama' }
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
      console.log('[LLM Service] Falling back to Remote Ollama...')
      for await (const chunk of streamRemoteOllama(prompt, config.systemPrompt, config)) {
        if (chunk.error) {
          console.log(`[LLM Service] ❌ Remote Ollama streaming failed: ${chunk.error}`)
          break
        }
        hasSuccess = true
        yield chunk
        if (chunk.done) return
      }
    }
  } else if (config.preferredBackend === 'remote-a6000') {
    for await (const chunk of streamRemoteOllama(prompt, config.systemPrompt, config)) {
      if (chunk.error) {
        console.log(`[LLM Service] ❌ Remote A6000 streaming failed: ${chunk.error}`)
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
      console.log('[LLM Service] Falling back to A6000...')
      for await (const chunk of streamRemoteOllama(prompt, config.systemPrompt, config)) {
        if (chunk.error) {
          console.log(`[LLM Service] ❌ Remote A6000 streaming failed: ${chunk.error}`)
          break
        }
        hasSuccess = true
        yield chunk
        if (chunk.done) return
      }
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
      content: "I'm unable to generate a response at this time. Please check that at least one LLM backend is available (Claude API key, A6000, or Blackwell tunnel).",
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

