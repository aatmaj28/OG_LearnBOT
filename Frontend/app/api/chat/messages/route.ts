import { type NextRequest, NextResponse } from "next/server"
import { getChatMessagesBySession } from "@/lib/mock-db"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get("sessionId")

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID required" }, { status: 400 })
    }

    const messages = getChatMessagesBySession(sessionId)

    return NextResponse.json({ messages })
  } catch (error) {
    console.error("[v0] Get messages error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
