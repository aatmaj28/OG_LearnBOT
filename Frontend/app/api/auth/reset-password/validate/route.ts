import { type NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { ensureDatabaseInitialized } from "@/lib/init-db"

export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseInitialized()

    const token = request.nextUrl.searchParams.get("token")
    if (!token || !token.trim()) {
      return NextResponse.json({ valid: false, error: "Token is required" }, { status: 400 })
    }

    const client = await pool.connect()
    try {
      const result = await client.query(
        `SELECT prt.user_id, prt.expires_at, u.role
         FROM password_reset_tokens prt
         JOIN users u ON u.id = prt.user_id
         WHERE prt.token = $1`,
        [token.trim()]
      )

      if (result.rows.length === 0) {
        return NextResponse.json({ valid: false })
      }

      const row = result.rows[0]
      const expiresAt = new Date(row.expires_at)
      if (expiresAt < new Date()) {
        return NextResponse.json({ valid: false, error: "Link has expired" })
      }

      return NextResponse.json({
        valid: true,
        role: row.role as string,
      })
    } finally {
      client.release()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[RESET-PASSWORD-VALIDATE] Error:", message, error)
    return NextResponse.json({ valid: false }, { status: 500 })
  }
}
