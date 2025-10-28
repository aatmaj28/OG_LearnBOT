import { type NextRequest, NextResponse } from "next/server"
import { generateChatResponse, generateChatResponseWithHistory } from "@/lib/ai-utils"
import { createChatMessage, getChatMessagesBySession } from "@/lib/mock-db"
import { ragService } from "@/lib/rag-service"

export async function POST(request: NextRequest) {
  try {
    const { message, userId, sessionId, classId } = await request.json()

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    // Check if RAG system is available and use it directly
    const ragInitialized = await ragService.waitForInitialization(3000)
    console.log('RAG initialized:', ragInitialized, 'userId:', userId, 'sessionId:', sessionId, 'classId:', classId)
    
    if (ragInitialized && userId && sessionId) {
      console.log('Using RAG system directly for response generation')
      try {
        const ragResponse = await ragService.generateRAGResponse(message, sessionId, userId, classId)
        
        // The RAG system already saves the message to the conversation
        // No need to save it again here
        
        return NextResponse.json({ response: ragResponse.response })
      } catch (ragError) {
        console.error('RAG system error:', ragError)
        // Fall through to Ollama fallback
      }
    } else {
      console.log('RAG system not available, trying Ollama with history')
    }
    
    // Get conversation history for context
    const messages = getChatMessagesBySession(sessionId)
    const messageHistory = messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }))

    // Generate AI response using Ollama (with mock fallback)
    const aiResponse = await generateChatResponseWithHistory(
      messageHistory,
      sessionId,
      userId
    )

    // Save AI response to database if userId and sessionId are provided
    if (userId && sessionId) {
      createChatMessage({
        userId,
        sessionId,
        role: "assistant",
        content: aiResponse,
      })
    }

    return NextResponse.json({ response: aiResponse })
  } catch (error) {
    console.error("[v0] AI response error:", error)
    return NextResponse.json({ error: "Failed to generate AI response" }, { status: 500 })
  }
}
