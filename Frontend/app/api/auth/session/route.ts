import { type NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { maskUserData, type MaskingContext } from "@/lib/pii-masking"

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

    // Apply PII masking to session response
    // PROD: Faculty see unmasked data, students see masked
    // DEV: Everyone sees masked data (to protect developers from seeing sensitive PROD data)
    const environment = process.env.NODE_ENV || 'development'
    const context: MaskingContext = {
      requestingUserId: session.user.id, // User requesting their own data
      requestingUserRole: session.user.role,
      environment
    }
    
    const maskedUser = maskUserData(session.user, context)

    return NextResponse.json({
      success: true,
      user: {
        id: maskedUser.id,
        email: maskedUser.email,
        name: maskedUser.name,
        role: maskedUser.role,
      },
    })
  } catch (error) {
    console.error("[v0] SESSION API ERROR:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
