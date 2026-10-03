import { type NextRequest, NextResponse } from "next/server"
import { createChatMessage, getChatMessagesBySession, updateChatSession } from "@/lib/mock-db"
import { generateChatResponse } from "@/lib/ai-utils"

export async function POST(request: NextRequest) {
  try {
    const { userId, sessionId, message } = await request.json()

    if (!userId || !sessionId || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Create user message
    createChatMessage({
      userId,
      sessionId,
      role: "user",
      content: message,
    })

    // Update session title if it's the first message
    const messages = getChatMessagesBySession(sessionId)
    if (messages.length === 1) {
      // First message
      const title = message.slice(0, 50) + (message.length > 50 ? "..." : "")
      updateChatSession(sessionId, { title })
    }

    return NextResponse.json({ 
      success: true, 
      messages: getChatMessagesBySession(sessionId) 
    })
  } catch (error) {
    console.error("[v0] Send message error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
