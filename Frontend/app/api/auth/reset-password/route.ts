import { type NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { ensureDatabaseInitialized } from "@/lib/init-db"
import { hashPassword } from "@/lib/password"

export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseInitialized()

    const { token, newPassword } = await request.json()

    if (!token || typeof token !== "string" || !token.trim()) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 })
    }
    if (!newPassword || typeof newPassword !== "string") {
      return NextResponse.json({ error: "New password is required" }, { status: 400 })
    }

    const trimmedPassword = newPassword.trim()
    if (trimmedPassword.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    try {
      const lookup = await client.query(
        `SELECT prt.user_id, prt.expires_at, u.role
         FROM password_reset_tokens prt
         JOIN users u ON u.id = prt.user_id
         WHERE prt.token = $1`,
        [token.trim()]
      )

      if (lookup.rows.length === 0) {
        return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 })
      }

      const row = lookup.rows[0]
      const expiresAt = new Date(row.expires_at)
      if (expiresAt < new Date()) {
        return NextResponse.json({ error: "This reset link has expired" }, { status: 400 })
      }

      const userId = row.user_id
      const role = row.role as string

      await client.query("BEGIN")

      await client.query("UPDATE users SET password = $1 WHERE id = $2", [
        await hashPassword(trimmedPassword),
        userId,
      ])
      await client.query("DELETE FROM password_reset_tokens WHERE token = $1", [
        token.trim(),
      ])

      await client.query("COMMIT")

      return NextResponse.json({ success: true, role })
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {})
      throw e
    } finally {
      client.release()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[RESET-PASSWORD] Error:", message, error)
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    )
  }
}
