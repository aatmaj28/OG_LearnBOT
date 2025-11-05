import { type NextRequest, NextResponse } from "next/server"
import { generateChatResponse, generateChatResponseWithHistory } from "@/lib/ai-utils"
import { createChatMessage, getChatMessagesBySession } from "@/lib/mock-db"
import { ragService } from "@/lib/rag-service"
import type { ModelBackend } from "@/lib/types"

export async function POST(request: NextRequest) {
  try {
    const { message, userId, sessionId, classId, preferredModel, stream } = await request.json()

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    // ✅ Always use RAG service (it has built-in fallback to LLM with checkpoint tracking)
    // Even if Python RAG is not initialized, it will use callPureLLM internally
    const ragInitialized = await ragService.waitForInitialization(3000)
    console.log('RAG initialized:', ragInitialized, 'userId:', userId, 'sessionId:', sessionId, 'classId:', classId)
    
    if (userId && sessionId) {
      console.log('Using RAG system for response generation (with checkpoint tracking) - preferred model:', preferredModel, 'streaming:', stream)
      
      // STREAMING MODE
      if (stream) {
        try {
          const encoder = new TextEncoder()
          const readable = new ReadableStream({
            async start(controller) {
              try {
                let fullResponse = ''
                
                for await (const chunk of ragService.generateRAGStreamingResponse(
                  message,
                  sessionId,
                  userId,
                  classId,
                  preferredModel as ModelBackend
                )) {
                  // Send chunk to client
                  const data = JSON.stringify(chunk)
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`))
                  
                  // Accumulate response
                  if (chunk.content) {
                    fullResponse += chunk.content
                  }
                  
                  // If done, close the stream
                  if (chunk.done) {
                    controller.close()
                    break
                  }
                }
              } catch (error) {
                console.error('Streaming error:', error)
                const errorData = JSON.stringify({ 
                  content: '', 
                  done: true, 
                  error: String(error) 
                })
                controller.enqueue(encoder.encode(`data: ${errorData}\n\n`))
                controller.close()
              }
            }
          })

          return new Response(readable, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            },
          })
        } catch (ragError) {
          console.error('RAG streaming error:', ragError)
          return NextResponse.json({ error: "Failed to stream response" }, { status: 500 })
        }
      }
      
      // NON-STREAMING MODE (original)
      try {
        const ragResponse = await ragService.generateRAGResponse(
          message, 
          sessionId, 
          userId, 
          classId,
          preferredModel as ModelBackend
        )
        
        // The RAG system already saves the message to the conversation
        // No need to save it again here
        
        return NextResponse.json({ 
          response: ragResponse.response,
          mode: ragResponse.mode || 'rag',
          contentFound: ragResponse.retrieval_result?.content_found || false,
          modelUsed: ragResponse.modelUsed,
          timeTaken: ragResponse.timeTaken
        })
      } catch (ragError) {
        console.error('RAG system error:', ragError)
        return NextResponse.json({ error: "Failed to generate response" }, { status: 500 })
      }
    }
    
    // ❌ OLD FALLBACK PATH REMOVED - RAG service now handles everything internally with checkpoint tracking
    // If no userId/sessionId, we can't use the database-backed RAG service
    return NextResponse.json({ error: "User ID and Session ID are required" }, { status: 400 })
  } catch (error) {
    console.error("[v0] AI response error:", error)
    return NextResponse.json({ error: "Failed to generate AI response" }, { status: 500 })
  }
}
