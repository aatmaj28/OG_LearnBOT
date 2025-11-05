// Ollama service for local AI inference
import { Ollama } from 'ollama'

// Initialize Ollama client
const ollama = new Ollama({
  host: 'http://localhost:11434' // Default Ollama host
})

// Available models - you can add more as needed
export const AVAILABLE_MODELS = {
  LLAMA_3_1_8B: 'llama3.1:8b',
  MISTRAL: 'mistral',
  MISTRAL_7B: 'mistral:7b',
  MISTRAL_7B_INSTRUCT: 'mistral:7b-instruct',
  MISTRAL_7B_LATEST: 'mistral:latest'
} as const

export type ModelName = keyof typeof AVAILABLE_MODELS

// Default model to use
const DEFAULT_MODEL = AVAILABLE_MODELS.LLAMA_3_1_8B

// Check if Ollama is running and model is available
export async function checkOllamaStatus(): Promise<{
  isRunning: boolean
  modelAvailable: boolean
  error?: string
}> {
  try {
    // Check if Ollama is running
    const models = await ollama.list()
    const modelNames = models.models.map(m => m.name)
    
    // Check if our default model is available
    const modelAvailable = modelNames.some(name => 
      name.includes('llama3.1') && name.includes('8b')
    )
    
    console.log('Available models:', modelNames)
    console.log('Model available check:', modelAvailable)
    
    return {
      isRunning: true,
      modelAvailable
    }
  } catch (error) {
    return {
      isRunning: false,
      modelAvailable: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// Generate response using Ollama
export async function generateOllamaResponse(
  message: string,
  model: string = DEFAULT_MODEL,
  context?: string
): Promise<string> {
  try {
    console.log('Generating response with model:', model)
    console.log('Message:', message)
    // Create a system prompt for educational assistance
    const systemPrompt = `You are an AI teaching assistant designed to help students learn. You should:
- Provide clear, educational explanations
- Break down complex topics into understandable parts
- Ask follow-up questions to encourage learning
- Be encouraging and supportive
- If you don't know something, admit it and suggest resources
- Keep responses concise but comprehensive

${context ? `Context: ${context}` : ''}`

    const response = await ollama.chat({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: message
        }
      ],
      options: {
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 1000
      }
    })

    return response.message.content
  } catch (error) {
    console.error('Ollama generation error:', error)
    throw new Error(`Failed to generate response: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Generate response with conversation history
export async function generateOllamaResponseWithHistory(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  model: string = DEFAULT_MODEL,
  context?: string
): Promise<string> {
  try {
    const systemPrompt = `You are an AI teaching assistant designed to help students learn. You should:
- Provide clear, educational explanations
- Break down complex topics into understandable parts
- Ask follow-up questions to encourage learning
- Be encouraging and supportive
- If you don't know something, admit it and suggest resources
- Keep responses concise but comprehensive
- Remember the conversation context

${context ? `Context: ${context}` : ''}`

    const response = await ollama.chat({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        ...messages
      ],
      options: {
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 1000
      }
    })

    return response.message.content
  } catch (error) {
    console.error('Ollama generation error:', error)
    throw new Error(`Failed to generate response: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Pull a model if it's not available
export async function pullModel(modelName: string): Promise<void> {
  try {
    console.log(`Pulling model ${modelName}...`)
    await ollama.pull({ model: modelName })
    console.log(`Model ${modelName} pulled successfully`)
  } catch (error) {
    console.error(`Failed to pull model ${modelName}:`, error)
    throw new Error(`Failed to pull model: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Get available models
export async function getAvailableModels(): Promise<string[]> {
  try {
    const models = await ollama.list()
    return models.models.map(m => m.name)
  } catch (error) {
    console.error('Failed to get available models:', error)
    return []
  }
}
