import { type NextRequest, NextResponse } from "next/server"
import { getUsers, getUserById, getUserByEmail } from "@/lib/db-service"
import { ensureDatabaseInitialized } from "@/lib/init-db"
import { getRequestingUser } from "@/lib/api-utils"

export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseInitialized()
    
    // Get requesting user context for PII masking
    const requestingUser = await getRequestingUser(request)
    
    const { searchParams } = new URL(request.url)
    const role = searchParams.get("role")
    const id = searchParams.get("id")
    const email = searchParams.get("email")

    if (id) {
      // Get specific user by ID with PII masking applied
      const user = await getUserById(
        id,
        requestingUser?.id,
        requestingUser?.role || null
      )
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }
      
      // PII masking already applied in getUserById
      // Just remove password field
      const safeUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        nuid: user.nuid,
        degree: user.degree,
        major: user.major,
        createdAt: user.createdAt,
      }
      
      return NextResponse.json({ user: safeUser })
    }

    if (email) {
      // Get specific user by email with PII masking applied
      const user = await getUserByEmail(
        email,
        requestingUser?.id,
        requestingUser?.role || null
      )
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }
      
      // PII masking already applied in getUserByEmail
      const safeUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        nuid: user.nuid,
        degree: user.degree,
        major: user.major,
        createdAt: user.createdAt,
      }
      
      return NextResponse.json({ user: safeUser })
    }

    // Get all users with PII masking applied
    let users = await getUsers(requestingUser?.id, requestingUser?.role || null)

    if (role) {
      users = users.filter((u) => u.role === role)
    }

    // PII masking already applied in getUsers
    // Just format response (password already removed by maskUserData)
    const safeUsers = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      nuid: u.nuid,
      degree: u.degree,
      major: u.major,
      createdAt: u.createdAt,
    }))

    return NextResponse.json({ users: safeUsers })
  } catch (error) {
    console.error("[v0] Get users error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
