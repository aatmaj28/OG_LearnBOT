import { NextResponse } from "next/server"
import { checkOllamaStatus, getAvailableModels } from "@/lib/ollama-service"

export async function GET() {
  try {
    const status = await checkOllamaStatus()
    const models = status.isRunning ? await getAvailableModels() : []
    
    return NextResponse.json({
      ...status,
      models
    })
  } catch (error) {
    console.error('Ollama status check error:', error)
    return NextResponse.json(
      { 
        isRunning: false, 
        modelAvailable: false, 
        error: 'Failed to check Ollama status',
        models: []
      }, 
      { status: 500 }
    )
  }
}
