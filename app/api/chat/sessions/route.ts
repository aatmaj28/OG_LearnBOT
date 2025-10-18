import { type NextRequest, NextResponse } from "next/server"
import { getChatSessionsByUser, createChatSession } from "@/lib/mock-db"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 })
    }

    const sessions = getChatSessionsByUser(userId)

    return NextResponse.json({ sessions })
  } catch (error) {
    console.error("[v0] Get sessions error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, title } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 })
    }

    const session = createChatSession(userId, title)

    return NextResponse.json({ session })
  } catch (error) {
    console.error("[v0] Create session error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
