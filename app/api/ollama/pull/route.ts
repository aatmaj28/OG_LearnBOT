import { NextRequest, NextResponse } from "next/server"
import { pullModel, checkOllamaStatus } from "@/lib/ollama-service"

export async function POST(request: NextRequest) {
  try {
    const { model } = await request.json()
    
    if (!model) {
      return NextResponse.json({ error: "Model name is required" }, { status: 400 })
    }

    // Check if Ollama is running first
    const status = await checkOllamaStatus()
    if (!status.isRunning) {
      return NextResponse.json(
        { error: "Ollama is not running. Please start Ollama first." }, 
        { status: 400 }
      )
    }

    // Pull the model
    await pullModel(model)
    
    return NextResponse.json({ 
      success: true, 
      message: `Model ${model} pulled successfully` 
    })
  } catch (error) {
    console.error('Model pull error:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to pull model' 
      }, 
      { status: 500 }
    )
  }
}
