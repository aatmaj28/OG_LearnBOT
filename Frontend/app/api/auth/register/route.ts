import { type NextRequest, NextResponse } from "next/server"
import { createUser, getUserByEmail, getUserByNuid } from "@/lib/db-service"
import { createSession } from "@/lib/auth"
import { ensureDatabaseInitialized } from "@/lib/init-db"

export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseInitialized()
    
    const { email, password, name, role, nuid, degree, major } = await request.json()

    console.log("[REGISTER] Starting registration for:", email, "role:", role)

    // Validate input
    if (!email || !password || !name || !role) {
      return NextResponse.json(
        { error: "Email, password, name, and role are required" },
        { status: 400 }
      )
    }

    // Validate role
    if (role !== "student" && role !== "faculty") {
      return NextResponse.json(
        { error: "Role must be 'student' or 'faculty'" },
        { status: 400 }
      )
    }

    // Check if user already exists
    const existingUser = await getUserByEmail(email)
    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 409 }
      )
    }

    // Check NUID if provided (for students)
    if (role === "student" && nuid) {
      const existingNuid = await getUserByNuid(nuid)
      if (existingNuid) {
        return NextResponse.json(
          { error: "User with this NUID already exists" },
          { status: 409 }
        )
      }
    }

    // Create user
    const newUser = await createUser({
      email,
      password,
      name,
      role,
      nuid: role === "student" ? nuid : undefined,
      degree: role === "student" ? degree : undefined,
      major: role === "student" ? major : undefined,
    })

    console.log("[REGISTER] User created successfully:", newUser.email)

    // Create session
    const sessionId = createSession(newUser)

    return NextResponse.json({
      success: true,
      sessionId,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        nuid: newUser.nuid,
        degree: newUser.degree,
      },
    })
  } catch (error) {
    console.error("[REGISTER] Registration error:", error)
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    )
  }
}

