import { type NextRequest, NextResponse } from "next/server"
import { createUser, getUserByEmail, getUserByNuid, getUserByEmailInternal, getUserByNuidInternal } from "@/lib/db-service"
import { ensureDatabaseInitialized } from "@/lib/init-db"

export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseInitialized()
    
    const { name, email, password, nuid, degree, major } = await request.json()

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 })
    }

    // Validate Northeastern email domain
    if (!email.endsWith('@northeastern.edu')) {
      return NextResponse.json({ error: "Only Northeastern University email addresses are accepted (@northeastern.edu)" }, { status: 400 })
    }

    // Generate a default password if not provided
    const studentPassword = password || `student${Date.now()}`

    // Check if user already exists by email (use internal function for validation)
    const existingUserByEmail = await getUserByEmailInternal(email)
    if (existingUserByEmail) {
      return NextResponse.json({ error: "User with this email already exists" }, { status: 409 })
    }

    // Check if user already exists by NUID (if NUID is provided) - use internal for validation
    if (nuid) {
      const existingUserByNuid = await getUserByNuidInternal(nuid)
      if (existingUserByNuid) {
        return NextResponse.json({ error: "User with this NUID already exists" }, { status: 409 })
      }
    }

    const newStudent = await createUser({
      name,
      email,
      password: studentPassword,
      role: "student",
      nuid,
      degree,
      major,
    })

    return NextResponse.json({ user: newStudent })
  } catch (error) {
    console.error("[v0] Create student error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
