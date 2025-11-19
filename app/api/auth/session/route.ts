import { type NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json()

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID required" }, { status: 400 })
    }

    const session = getSession(sessionId)

    if (!session) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 })
    }

    return NextResponse.json({
      success: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role,
      },
    })
  } catch (error) {
    console.error("[v0] SESSION API ERROR:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
