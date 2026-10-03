import { type NextRequest, NextResponse } from "next/server"
import { createUser, getUserByEmail, getUserByNuid, getUserByEmailInternal, getUserByNuidInternal } from "@/lib/db-service"
import { ensureDatabaseInitialized } from "@/lib/init-db"

// Company email policy. Set COMPANY_EMAIL_DOMAIN (e.g. "acme.com") to restrict employees to a
// single domain; leave it unset to accept any well-formed work email.
const COMPANY_EMAIL_DOMAIN = (process.env.COMPANY_EMAIL_DOMAIN || "").trim().replace(/^@/, "").toLowerCase()
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const isValidWorkEmail = (email: string) => {
  const value = (email || "").trim().toLowerCase()
  if (!EMAIL_PATTERN.test(value)) return false
  return COMPANY_EMAIL_DOMAIN ? value.endsWith(`@${COMPANY_EMAIL_DOMAIN}`) : true
}

const WORK_EMAIL_ERROR = COMPANY_EMAIL_DOMAIN
  ? `Only @${COMPANY_EMAIL_DOMAIN} email addresses are accepted`
  : "A valid work email address is required"

export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseInitialized()
    
    const { name, email, password, nuid, degree, major } = await request.json()

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 })
    }

    if (!isValidWorkEmail(email)) {
      return NextResponse.json({ error: WORK_EMAIL_ERROR }, { status: 400 })
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

    const { password: _password, ...student } = newStudent
    return NextResponse.json({ user: student })
  } catch (error) {
    console.error("[v0] Create student error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
