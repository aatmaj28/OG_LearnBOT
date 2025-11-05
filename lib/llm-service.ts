// LLM Service for multiple model backends
// Supports OpenAI API and Remote Ollama with fallback mechanisms

export type ModelBackend = 'openai' | 'remote-ollama'

export interface LLMResponse {
  response: string
  modelUsed: ModelBackend
  timeTaken: number // in milliseconds
  success: boolean
  error?: string
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

// OpenAI API call
async function callOpenAI(prompt: string, systemPrompt: string, config?: Partial<LLMConfig>): Promise<LLMResponse> {
  const startTime = Date.now()
  
  try {
    const apiKey = process.env.OPENAI_API_KEY
    
    if (!apiKey || apiKey.includes('your-openai-api-key')) {
      throw new Error('OpenAI API key not configured')
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: config?.temperature ?? 0.7,
        max_tokens: config?.maxTokens ?? 1000
      })
    })

    const endTime = Date.now()

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`OpenAI API error: ${response.status} - ${errorData}`)
    }

    const data = await response.json()
    const responseText = data.choices?.[0]?.message?.content || ''

    return {
      response: responseText,
      modelUsed: 'openai',
      timeTaken: endTime - startTime,
      success: true
    }
  } catch (error) {
    const endTime = Date.now()
    console.error('OpenAI API error:', error)
    return {
      response: '',
      modelUsed: 'openai',
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
      modelUsed: 'remote-ollama',
      timeTaken: endTime - startTime,
      success: true
    }
  } catch (error) {
    const endTime = Date.now()
    console.error('Remote Ollama error:', error)
    return {
      response: '',
      modelUsed: 'remote-ollama',
      timeTaken: endTime - startTime,
      success: false,
      error: error instanceof Error ? error.message : String(error)
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
 * 2. If fails, try the other backend (OpenAI <-> Remote Ollama)
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
  
  if (config.preferredBackend === 'openai') {
    result = await callOpenAI(prompt, config.systemPrompt, config)
    if (result.success) {
      console.log(`[LLM Service] ✅ OpenAI succeeded in ${result.timeTaken}ms`)
      return result
    }
    console.log(`[LLM Service] ❌ OpenAI failed: ${result.error}`)
    
    // Fallback to Remote Ollama
    console.log('[LLM Service] Falling back to Remote Ollama...')
    result = await callRemoteOllama(prompt, config.systemPrompt, config)
    if (result.success) {
      console.log(`[LLM Service] ✅ Remote Ollama succeeded in ${result.timeTaken}ms`)
      return result
    }
    console.log(`[LLM Service] ❌ Remote Ollama failed: ${result.error}`)
    
  } else {
    // Remote Ollama
    result = await callRemoteOllama(prompt, config.systemPrompt, config)
    if (result.success) {
      console.log(`[LLM Service] ✅ Remote Ollama succeeded in ${result.timeTaken}ms`)
      return result
    }
    console.log(`[LLM Service] ❌ Remote Ollama failed: ${result.error}`)
    
    // Fallback to OpenAI
    console.log('[LLM Service] Falling back to OpenAI...')
    result = await callOpenAI(prompt, config.systemPrompt, config)
    if (result.success) {
      console.log(`[LLM Service] ✅ OpenAI succeeded in ${result.timeTaken}ms`)
      return result
    }
    console.log(`[LLM Service] ❌ OpenAI failed: ${result.error}`)
  }

  // All backends failed
  return {
    response: "I'm unable to generate a response at this time. Please check that at least one LLM backend is available (OpenAI API key configured or Remote Ollama tunnel active).",
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
 * Stream response from OpenAI with SSE
 */
async function* streamOpenAI(
  prompt: string,
  systemPrompt: string,
  config?: Partial<LLMConfig>
): AsyncGenerator<LLMStreamChunk> {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    
    if (!apiKey || apiKey.includes('your-openai-api-key')) {
      yield { content: '', done: true, error: 'OpenAI API key not configured', modelUsed: 'openai' }
      return
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: config?.temperature ?? 0.7,
        max_tokens: config?.maxTokens ?? 1000,
        stream: true
      })
    })

    if (!response.ok) {
      const errorData = await response.text()
      yield { content: '', done: true, error: `OpenAI error: ${response.status}`, modelUsed: 'openai' }
      return
    }

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) {
      yield { content: '', done: true, error: 'No response stream', modelUsed: 'openai' }
      return
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n').filter(line => line.trim() !== '')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') {
            yield { content: '', done: true, modelUsed: 'openai' }
            return
          }

          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content || ''
            if (content) {
              yield { content, done: false, modelUsed: 'openai' }
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    yield { content: '', done: true, modelUsed: 'openai' }
  } catch (error) {
    console.error('OpenAI streaming error:', error)
    yield { content: '', done: true, error: String(error), modelUsed: 'openai' }
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
      yield { content: '', done: true, error: `Remote Ollama error: ${response.status}`, modelUsed: 'remote-ollama' }
      return
    }

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) {
      yield { content: '', done: true, error: 'No response stream', modelUsed: 'remote-ollama' }
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
            yield { content: parsed.response, done: false, modelUsed: 'remote-ollama' }
          }
          if (parsed.done) {
            yield { content: '', done: true, modelUsed: 'remote-ollama' }
            return
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }

    yield { content: '', done: true, modelUsed: 'remote-ollama' }
  } catch (error) {
    console.error('Remote Ollama streaming error:', error)
    yield { content: '', done: true, error: String(error), modelUsed: 'remote-ollama' }
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
  if (config.preferredBackend === 'openai') {
    for await (const chunk of streamOpenAI(prompt, config.systemPrompt, config)) {
      if (chunk.error) {
        console.log(`[LLM Service] ❌ OpenAI streaming failed: ${chunk.error}`)
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
  } else if (config.preferredBackend === 'remote-ollama') {
    for await (const chunk of streamRemoteOllama(prompt, config.systemPrompt, config)) {
      if (chunk.error) {
        console.log(`[LLM Service] ❌ Remote Ollama streaming failed: ${chunk.error}`)
        break
      }
      hasSuccess = true
      yield chunk
      if (chunk.done) return
    }

    if (!hasSuccess) {
      console.log('[LLM Service] Falling back to OpenAI...')
      for await (const chunk of streamOpenAI(prompt, config.systemPrompt, config)) {
        if (chunk.error) {
          console.log(`[LLM Service] ❌ OpenAI streaming failed: ${chunk.error}`)
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
      content: "I'm unable to generate a response at this time. Please check that at least one LLM backend is available (OpenAI API key or Remote Ollama tunnel).",
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
  switch (backend) {
    case 'openai':
      return 'OpenAI (GPT-3.5)'
    case 'remote-ollama':
      return `Remote Ollama (${process.env.REMOTE_OLLAMA_MODEL || 'gemma3:27b'})`
    default:
      return 'Unknown'
  }
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

