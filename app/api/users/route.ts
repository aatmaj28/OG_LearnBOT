import { type NextRequest, NextResponse } from "next/server"
import { getUsers, getUserById } from "@/lib/db-service"
import { ensureDatabaseInitialized } from "@/lib/init-db"

export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseInitialized()
    
    const { searchParams } = new URL(request.url)
    const role = searchParams.get("role")
    const id = searchParams.get("id")

    if (id) {
      // Get specific user by ID
      const user = await getUserById(id)
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }
      
      // Remove sensitive data
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

    let users = await getUsers()

    if (role) {
      users = users.filter((u) => u.role === role)
    }

    // Remove sensitive data
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
