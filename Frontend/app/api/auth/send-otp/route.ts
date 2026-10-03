import { type NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { getUserByEmail, getUserByNuid } from "@/lib/db-service"
import nodemailer from "nodemailer"
import { hashPassword } from "@/lib/password"

// Generate 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// Send verification email using Gmail
async function sendVerificationEmail(email: string, otp: string, name: string) {
  // Check if email credentials are configured
  const gmailUser = process.env.GMAIL_USER
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD

  // If no credentials, fall back to console logging (for testing)
  if (!gmailUser || !gmailAppPassword) {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    EMAIL VERIFICATION                        ║
╠══════════════════════════════════════════════════════════════╣
║ To: ${email.padEnd(55)}║
║                                                              ║
║ Subject: OnboardAI Portal - Email Verification               ║
║                                                              ║
║ Welcome to OnboardAI Portal!                                 ║
║                                                              ║
║ Hello ${name.padEnd(51)}║
║                                                              ║
║ Please use the verification code below to complete          ║
║ your registration.                                           ║
║                                                              ║
║ Your verification code is:                                   ║
║                                                              ║
║                       ${otp}                                ║
║                                                              ║
║ This code expires in 10 minutes.                             ║
║                                                              ║
║ If you didn't request this verification, please ignore      ║
║ this email.                                                  ║
║                                                              ║
║ © 2026 OnboardAI                                              ║
╚══════════════════════════════════════════════════════════════╝
    `)
    console.warn('⚠️  Gmail credentials not configured. Email logged to console only.')
    console.warn('   To enable real emails, add GMAIL_USER and GMAIL_APP_PASSWORD to .env.local')
    return { success: true }
  }

  try {
    // Create transporter with Gmail SMTP
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    })

    // HTML email template
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      background-color: #f9f9f9;
      border: 1px solid #ddd;
      border-radius: 10px;
      padding: 30px;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .header h1 {
      color: #2563eb;
      margin: 0;
      font-size: 28px;
    }
    .otp-box {
      background-color: #f0f7ff;
      border: 2px solid #2563eb;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin: 30px 0;
    }
    .otp-code {
      font-size: 36px;
      font-weight: bold;
      color: #2563eb;
      letter-spacing: 8px;
      font-family: 'Courier New', monospace;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      text-align: center;
      font-size: 12px;
      color: #666;
    }
    .warning {
      background-color: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 5px;
      padding: 15px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>OnboardAI Portal</h1>
      <p>Email Verification</p>
    </div>
    
    <p>Hello <strong>${name}</strong>,</p>
    
    <p>Welcome to <strong>OnboardAI</strong>!</p>
    
    <p>Please use the verification code below to complete your registration:</p>
    
    <div class="otp-box">
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Your verification code is:</p>
      <div class="otp-code">${otp}</div>
    </div>
    
    <p><strong>This code expires in 10 minutes.</strong></p>
    
    <div class="warning">
      <p style="margin: 0;"><strong>⚠️ Security Note:</strong> If you didn't request this verification, please ignore this email. Never share this code with anyone.</p>
    </div>
    
    <div class="footer">
      <p>© 2026 OnboardAI</p>
      <p>This is an automated message, please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
    `

    // Send email
    await transporter.sendMail({
      from: `"OnboardAI Portal" <${gmailUser}>`,
      to: email,
      subject: 'OnboardAI Portal - Email Verification',
      html: htmlContent,
      text: `Welcome to OnboardAI!\n\nHello ${name},\n\nYour verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this verification, please ignore this email.\n\n© 2026 OnboardAI`
    })

    console.log(`✅ Verification email sent successfully to ${email}`)
    return { success: true }
  } catch (error) {
    console.error('❌ Failed to send email:', error)
    throw new Error('Failed to send verification email')
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email, password, name, role, nuid, degree, major } = await request.json()

    console.log("[SEND-OTP] Initiating OTP send for:", email)

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

    // Generate OTP
    const otp = generateOTP()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now

    // Store pending registration
    const client = await pool.connect()
    try {
      // Delete any existing pending registration for this email
      await client.query(
        'DELETE FROM pending_registrations WHERE email = $1',
        [email]
      )

      // Insert new pending registration
      await client.query(
        `INSERT INTO pending_registrations 
         (email, password, name, role, nuid, degree, major, otp_code, otp_expires_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [email, await hashPassword(password), name, role, nuid, degree, major, otp, expiresAt]
      )

      console.log("[SEND-OTP] Pending registration created with OTP:", otp)
    } finally {
      client.release()
    }

    // Send verification email
    await sendVerificationEmail(email, otp, name)

    return NextResponse.json({
      success: true,
      message: "Verification code sent to your email",
      email: email
    })
  } catch (error) {
    console.error("[SEND-OTP] Error:", error)
    return NextResponse.json(
      { error: "Failed to send verification code" },
      { status: 500 }
    )
  }
}

