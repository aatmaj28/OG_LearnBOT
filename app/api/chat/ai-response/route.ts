import { type NextRequest, NextResponse } from "next/server"
import { generateChatResponse } from "@/lib/ai-utils"
import { createChatMessage } from "@/lib/mock-db"

export async function POST(request: NextRequest) {
  try {
    const { message, userId, sessionId } = await request.json()

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    // Generate AI response
    const aiResponse = await generateChatResponse(message)

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
