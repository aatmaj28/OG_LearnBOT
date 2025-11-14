import { type NextRequest, NextResponse } from "next/server"
import { getRAGService } from "@/lib/rag-service"

export async function POST(request: NextRequest) {
  try {
    const { userId, userRole } = await request.json()
    
    if (!userId || !userRole) {
      return NextResponse.json(
        { error: "userId and userRole are required" },
        { status: 400 }
      )
    }

    if (userRole !== 'student' && userRole !== 'faculty') {
      return NextResponse.json(
        { error: "userRole must be 'student' or 'faculty'" },
        { status: 400 }
      )
    }

    const ragService = getRAGService()
    
    // Wait for RAG to be initialized (increased timeout to 60s to account for model loading)
    const isReady = await ragService.waitForInitialization(60000)
    if (!isReady) {
      console.warn('[RAG Preload API] RAG service not ready after 60s timeout')
      return NextResponse.json(
        { 
          error: "RAG service not ready. Please try again in a moment.", 
          success: false, 
          loaded: 0, 
          failed: 0, 
          total: 0 
        },
        { status: 503 }
      )
    }

    // Preload user's classes (this will gracefully handle if RAG isn't ready)
    const result = await ragService.preloadUserClasses(userId, userRole)
    
    return NextResponse.json(result)
  } catch (error) {
    console.error('[RAG Preload API] Error:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Internal server error',
        success: false,
        loaded: 0,
        failed: 0,
        total: 0
      },
      { status: 500 }
    )
  }
}

