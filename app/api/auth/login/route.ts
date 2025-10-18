import { type NextRequest, NextResponse } from "next/server"
import { login, createSession } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const { email, password, role } = await request.json()

    console.log("[v0] LOGIN: Starting login process for:", email, "role:", role)

    // Validate input
    if (!email || !password) {
      console.log("[v0] LOGIN: Missing email or password")
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }

    // Create a mock user based on the provided credentials and role
    const mockUser = {
      id: Date.now().toString(),
      email: email,
      name: email.split('@')[0], // Use part before @ as name
      role: role || 'student', // Use provided role or default to student
      password: password // Not used for validation
    }

    console.log("[v0] LOGIN: Mock user created:", mockUser.email, "role:", mockUser.role)

    // Create session
    const sessionId = createSession(mockUser)
    console.log("[v0] LOGIN: Session created successfully:", sessionId)

    return NextResponse.json({
      success: true,
      sessionId,
      user: {
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
      },
    })
  } catch (error) {
    console.error("[v0] LOGIN ERROR:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
