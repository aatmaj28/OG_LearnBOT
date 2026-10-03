import { type NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { getUserByEmailInternal } from "@/lib/db-service"
import { ensureDatabaseInitialized } from "@/lib/init-db"
import nodemailer from "nodemailer"
import crypto from "crypto"

const RESET_EXPIRY_HOURS = 1

async function sendPasswordResetEmail(email: string, resetLink: string) {
  const gmailUser = process.env.GMAIL_USER
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD

  if (!gmailUser || !gmailAppPassword) {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                 PASSWORD RESET EMAIL (dev)                   ║
╠══════════════════════════════════════════════════════════════╣
║ To: ${email.padEnd(55)}║
║ Reset link: ${resetLink.substring(0, 50)}...
║ Link expires in ${RESET_EXPIRY_HOURS} hour(s).
╚══════════════════════════════════════════════════════════════╝
    `)
    console.warn("⚠️ Gmail not configured. Reset link logged above.")
    return { success: true }
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailAppPassword },
  })

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .container { background-color: #f9f9f9; border: 1px solid #ddd; border-radius: 10px; padding: 30px; }
    .header { text-align: center; margin-bottom: 30px; }
    .header h1 { color: #2563eb; margin: 0; font-size: 28px; }
    .btn { display: inline-block; background: #6C63FF; color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 12px; color: #666; }
    .notice { color: #666; font-size: 14px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>LearnBOT Portal</h1>
      <p>Password Reset</p>
    </div>
    <p>We received a request to reset your password. Click the button below to proceed. This link will expire in ${RESET_EXPIRY_HOURS} hour.</p>
    <p style="text-align: center;">
      <a href="${resetLink}" class="btn">Reset Password</a>
    </p>
    <p class="notice">If you did not request this, you can safely ignore this email.</p>
    <div class="footer">
      <p>© 2026 LearnBOT Portal - Northeastern University</p>
      <p>This is an automated message, please do not reply.</p>
    </div>
  </div>
</body>
</html>
  `

  await transporter.sendMail({
    from: `"LearnBOT Portal" <${gmailUser}>`,
    to: email,
    subject: "LearnBOT Portal - Reset your password",
    html: htmlContent,
    text: `We received a request to reset your password. Open this link to proceed (expires in ${RESET_EXPIRY_HOURS} hour):\n\n${resetLink}\n\nIf you did not request this, you can safely ignore this email.\n\n© 2026 LearnBOT Portal - Northeastern University`,
  })
  console.log(`✅ Password reset email sent to ${email}`)
  return { success: true }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseInitialized()

    const { email } = await request.json()

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    // Look up user by email (internal so we get id, email, role for token and email)
    const user = await getUserByEmailInternal(normalizedEmail)
    if (!user) {
      // Do not reveal whether the email exists; same response and status
      return NextResponse.json({
        success: true,
        message: "If an account exists with this email, a reset link has been sent.",
      })
    }

    const token = crypto.randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + RESET_EXPIRY_HOURS * 60 * 60 * 1000)

    const client = await pool.connect()
    try {
      await client.query(
        "DELETE FROM password_reset_tokens WHERE user_id = $1",
        [user.id]
      )
      await client.query(
        "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
        [user.id, token, expiresAt]
      )
    } finally {
      client.release()
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.nextUrl?.origin ||
      "https://learnbot.dashlab.studio"
    const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`

    await sendPasswordResetEmail(user.email, resetLink)

    return NextResponse.json({
      success: true,
      message: "If an account exists with this email, a reset link has been sent.",
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    const message = err.message
    const stack = err instanceof Error ? err.stack : undefined
    console.error("[FORGOT-PASSWORD] Error:", message)
    if (stack) console.error("[FORGOT-PASSWORD] Stack:", stack)
    return NextResponse.json(
      { error: "Something went wrong. Please try again later." },
      { status: 500 }
    )
  }
}
