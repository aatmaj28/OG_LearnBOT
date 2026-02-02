import { type NextRequest, NextResponse } from "next/server"
import { generateChatResponse, generateChatResponseWithHistory } from "@/lib/ai-utils"
import { createChatMessage, getChatMessagesBySession } from "@/lib/mock-db"
import { ragService } from "@/lib/rag-service"
import type { ModelBackend } from "@/lib/types"
import {
  detectInjectionAttempt,
  sanitizeInput,
  getRedirectResponse,
  validateOutput,
  sanitizeOutput,
} from "@/lib/prompts/guardrails"

export async function POST(request: NextRequest) {
  try {
    // Check if request is FormData (file upload) or JSON
    const contentType = request.headers.get('content-type') || ''
    let message: string
    let userId: string
    let sessionId: string
    let classId: string | undefined
    let chatType: string | undefined
    let preferredModel: ModelBackend
    let stream: boolean
    let deepThinking: boolean = false
    let attachments: File[] = []
    let assistantMessageTimestamp: Date | undefined = undefined

    if (contentType.includes('multipart/form-data')) {
      // Handle FormData (file uploads)
      const formData = await request.formData()
      message = formData.get('message') as string
      userId = formData.get('userId') as string
      sessionId = formData.get('sessionId') as string
      classId = formData.get('classId') as string | undefined
      chatType = formData.get('chatType') as string | undefined
      preferredModel = (formData.get('preferredModel') as ModelBackend) || 'claude'
      stream = formData.get('stream') === 'true'
      deepThinking = formData.get('deepThinking') === 'true'
      
      // Extract frontend timestamp if provided
      const timestampStr = formData.get('assistantMessageTimestamp') as string | null
      if (timestampStr) {
        assistantMessageTimestamp = new Date(timestampStr)
      }
      
      // Extract file attachments
      const attachmentFiles = formData.getAll('attachments') as File[]
      attachments = attachmentFiles.filter(file => file && file.size > 0)
    } else {
      // Handle JSON
      const body = await request.json()
      message = body.message
      userId = body.userId
      sessionId = body.sessionId
      classId = body.classId
      chatType = body.chatType
      preferredModel = body.preferredModel || 'claude'
      stream = body.stream || false
      deepThinking = body.deepThinking || false
      
      // Extract frontend timestamp if provided
      if (body.assistantMessageTimestamp) {
        assistantMessageTimestamp = new Date(body.assistantMessageTimestamp)
      }
    }

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    // Guardrail Layer: pre-LLM input scan and sanitization
    const detection = detectInjectionAttempt(message)
    const sanitizedMessage = sanitizeInput(detection.sanitizedInput || message)

    if (detection.shouldBlock) {
      const redirect = getRedirectResponse(detection)
      // For streaming requests, respond with a single SSE event and close
      if (stream) {
        const encoder = new TextEncoder()
        const readable = new ReadableStream({
          start(controller) {
            const data = JSON.stringify({ content: redirect, done: true, blocked: true })
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            controller.close()
          }
        })
        return new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        })
      }

      return NextResponse.json({
        response: redirect,
        blocked: true,
      }, {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      })
    }

    // ✅ Always use RAG service (it has built-in fallback to LLM with checkpoint tracking)
    // Even if Python RAG is not initialized, it will use callPureLLM internally
    const ragInitialized = await ragService.waitForInitialization(3000)
    console.log('RAG initialized:', ragInitialized, 'userId:', userId, 'sessionId:', sessionId, 'classId:', classId, 'chatType:', chatType)
    
    if (userId && sessionId) {
      console.log('Using RAG system for response generation (with checkpoint tracking) - preferred model:', preferredModel, 'streaming:', stream, 'chatType:', chatType)
      
      // STREAMING MODE
      if (stream) {
        try {
          const encoder = new TextEncoder()
          const readable = new ReadableStream({
            async start(controller) {
              try {
                let fullResponse = ''
                let streamClosed = false
                let sawDone = false
                
                for await (const chunk of ragService.generateRAGStreamingResponse(
                  sanitizedMessage,
                  sessionId,
                  userId,
                  classId,
                  preferredModel as ModelBackend,
                  chatType || 'class_material', // Default to class_material if not specified
                  deepThinking,
                  attachments,
                  assistantMessageTimestamp
                )) {
                  // Check if controller is already closed
                  if (streamClosed) {
                    break
                  }
                  
                  try {
                    // Send chunk to client
                    const data = JSON.stringify(chunk)
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`))
                    
                    // Accumulate response
                    if (chunk.content) {
                      fullResponse += chunk.content
                    }
                    
                    // If done, mark and break to run validation before closing
                    if (chunk.done) {
                      sawDone = true
                      break
                    }
                  } catch (enqueueError: any) {
                    // If controller is already closed, that's OK - just break
                    if (enqueueError?.code === 'ERR_INVALID_STATE' || enqueueError?.message?.includes('closed')) {
                      streamClosed = true
                      break
                    }
                    // Otherwise, re-throw
                    throw enqueueError
                  }
                }
                
                // Post-LLM output validation/sanitization for streaming
                if (!streamClosed) {
                  const validation = validateOutput(fullResponse, sanitizedMessage)
                  const safeResponse = sanitizeOutput(fullResponse, validation)
                  if (!validation.isValid) {
                    const safeChunk = { content: `${safeResponse} If you need something else, let me know!`, done: false }
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(safeChunk)}\n\n`))
                  }
                  // send final done
                  if (sawDone) {
                    const doneChunk = { content: '', done: true }
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneChunk)}\n\n`))
                  }
                  try {
                    controller.close()
                  } catch (e) {
                    // Controller might already be closed, that's OK
                  }
                }
              } catch (error) {
                console.error('Streaming error:', error)
                try {
                  const errorData = JSON.stringify({ 
                    content: '', 
                    done: true, 
                    error: String(error) 
                  })
                  controller.enqueue(encoder.encode(`data: ${errorData}\n\n`))
                  controller.close()
                } catch (closeError) {
                  // Controller might already be closed, that's OK
                  console.error('Error closing stream:', closeError)
                }
              }
            }
          })

          return new Response(readable, {
            headers: {
              'Content-Type': 'text/event-stream; charset=utf-8',
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
          sanitizedMessage, 
          sessionId, 
          userId, 
          classId,
          preferredModel as ModelBackend,
          chatType || 'class_material', // Default to class_material if not specified
          deepThinking,
          attachments
        )
        
        // The RAG system already saves the message to the conversation
        // No need to save it again here
        
        // Guardrail Layer: post-LLM output validation/sanitization
        const validation = validateOutput(ragResponse.response, sanitizedMessage)
        const safeResponse = sanitizeOutput(ragResponse.response, validation)
        const finalResponse = validation.isValid ? safeResponse : `${safeResponse} If you need something else, let me know!`

        return NextResponse.json({ 
          response: finalResponse,
          mode: ragResponse.mode || 'rag',
          contentFound: ragResponse.retrieval_result?.content_found || false,
          modelUsed: ragResponse.modelUsed,
          timeTaken: ragResponse.timeTaken,
          validationIssues: validation.isValid ? undefined : validation.issues
        }, {
          headers: {
            'Content-Type': 'application/json; charset=utf-8'
          }
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
