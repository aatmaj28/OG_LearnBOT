import { type NextRequest, NextResponse } from "next/server"
import { getSession, debugSessions } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] SESSION API: Received session check request")
    
    const { sessionId } = await request.json()

    console.log("[v0] SESSION API: Session check request for:", sessionId)
    console.log("[v0] SESSION API: Session ID type:", typeof sessionId)
    console.log("[v0] SESSION API: Session ID length:", sessionId?.length)
    
    // Debug session storage
    console.log("[v0] SESSION API: Debugging session storage:")
    debugSessions()

    if (!sessionId) {
      console.log("[v0] SESSION API: No session ID provided")
      return NextResponse.json({ error: "Session ID required" }, { status: 400 })
    }

    console.log("[v0] SESSION API: Looking up session in storage")
    const session = getSession(sessionId)

    if (!session) {
      console.log("[v0] SESSION API: Session not found or expired:", sessionId)
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 })
    }

    console.log("[v0] SESSION API: Session found for user:", session.user.email)

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
