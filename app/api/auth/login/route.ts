import { type NextRequest, NextResponse } from "next/server"
import { login, createSession } from "@/lib/auth"
import { ensureDatabaseInitialized } from "@/lib/init-db"
import { maskUserData, type MaskingContext } from "@/lib/pii-masking"

export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseInitialized()
    
    const { email, password, role } = await request.json()

    console.log("[v0] LOGIN: Starting login process for:", email, "role:", role)

    // Validate input
    if (!email || !password) {
      console.log("[v0] LOGIN: Missing email or password")
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }

    // Try to authenticate with database (uses internal function for real email)
    const user = await login(email, password)
    
    if (!user) {
      console.log("[v0] LOGIN: Authentication failed for:", email)
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
    }

    // Check role if specified
    if (role && user.role !== role) {
      console.log("[v0] LOGIN: Role mismatch. Expected:", role, "Got:", user.role)
      return NextResponse.json({ error: "Invalid role" }, { status: 403 })
    }

    console.log("[v0] LOGIN: User authenticated successfully:", user.email, "role:", user.role)

    // Create session with full user data (internal use)
    const sessionId = createSession(user)
    console.log("[v0] LOGIN: Session created successfully:", sessionId)

    // Apply PII masking to response (users see their own unmasked data in login response)
    // Faculty in production see unmasked data, students always see masked (except their own)
    const environment = process.env.NODE_ENV || 'development'
    const context: MaskingContext = {
      requestingUserId: user.id, // User requesting their own data
      requestingUserRole: user.role,
      environment
    }
    
    // Users see their own unmasked data, but maskUserData handles this
    const maskedUser = maskUserData(user, context)

    return NextResponse.json({
      success: true,
      sessionId,
      user: {
        id: maskedUser.id,
        email: maskedUser.email,
        name: maskedUser.name,
        role: maskedUser.role,
        nuid: maskedUser.nuid,
        degree: maskedUser.degree,
        major: maskedUser.major,
      },
    })
  } catch (error) {
    console.error("[v0] LOGIN ERROR:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
