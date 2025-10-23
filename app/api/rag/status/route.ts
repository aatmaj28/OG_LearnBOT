import { type NextRequest, NextResponse } from "next/server"
import { ragService } from "@/lib/rag-service"

export async function GET(request: NextRequest) {
  try {
    // Wait for RAG service to initialize
    const isAvailable = await ragService.waitForInitialization(5000)
    
    return NextResponse.json({ 
      isAvailable,
      message: isAvailable ? "RAG service is ready" : "RAG service not available"
    })
  } catch (error) {
    console.error("RAG status check error:", error)
    return NextResponse.json({ 
      isAvailable: false,
      message: "Error checking RAG service status"
    }, { status: 500 })
  }
}
