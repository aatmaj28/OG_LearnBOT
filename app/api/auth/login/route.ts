import { type NextRequest, NextResponse } from "next/server"
import { login, createSession } from "@/lib/auth"
import { ensureDatabaseInitialized } from "@/lib/init-db"

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

    // Try to authenticate with database
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

    // Create session
    const sessionId = createSession(user)
    console.log("[v0] LOGIN: Session created successfully:", sessionId)

    return NextResponse.json({
      success: true,
      sessionId,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        nuid: user.nuid,
        degree: user.degree,
        major: user.major,
      },
    })
  } catch (error) {
    console.error("[v0] LOGIN ERROR:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
