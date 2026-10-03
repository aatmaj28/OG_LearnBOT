import { type NextRequest, NextResponse } from "next/server"
import { ragService } from "@/lib/rag-service"

export async function GET(request: NextRequest) {
  try {
    // Check current availability (don't wait, just report current state)
    const isAvailable = ragService.isAvailable()
    
    return NextResponse.json({ 
      isAvailable,
      message: isAvailable ? "RAG service is ready" : "RAG service initializing..."
    })
  } catch (error) {
    console.error("RAG status check error:", error)
    return NextResponse.json({ 
      isAvailable: false,
      message: "Error checking RAG service status"
    }, { status: 500 })
  }
}
