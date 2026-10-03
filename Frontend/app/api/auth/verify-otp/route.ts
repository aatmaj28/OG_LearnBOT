import { type NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { createUser } from "@/lib/db-service"
import { createSession } from "@/lib/auth"
import { getMaskedId } from "@/lib/masked-id-utils"

export async function POST(request: NextRequest) {
  try {
    const { email, otp } = await request.json()

    console.log("[VERIFY-OTP] Verifying OTP for:", email)

    if (!email || !otp) {
      return NextResponse.json(
        { error: "Email and OTP are required" },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    try {
      // Find pending registration
      const result = await client.query(
        `SELECT * FROM pending_registrations 
         WHERE email = $1 AND otp_code = $2`,
        [email, otp]
      )

      if (result.rows.length === 0) {
        console.log("[VERIFY-OTP] Invalid OTP or email")
        return NextResponse.json(
          { error: "Invalid verification code" },
          { status: 400 }
        )
      }

      const pendingReg = result.rows[0]

      // Check if OTP has expired
      const now = new Date()
      const expiresAt = new Date(pendingReg.otp_expires_at)

      if (now > expiresAt) {
        console.log("[VERIFY-OTP] OTP expired")
        return NextResponse.json(
          { error: "Verification code has expired. Please request a new one." },
          { status: 400 }
        )
      }

      console.log("[VERIFY-OTP] OTP verified successfully, creating user...")

      // Create the actual user account
      const newUser = await createUser({
        email: pendingReg.email,
        password: pendingReg.password,
        name: pendingReg.name,
        role: pendingReg.role,
        nuid: pendingReg.nuid,
        degree: pendingReg.degree,
        major: pendingReg.major,
      })

      // Delete the pending registration
      await client.query(
        'DELETE FROM pending_registrations WHERE email = $1',
        [email]
      )

      console.log("[VERIFY-OTP] User created successfully:", newUser.email)

      // Auto-enroll in any classes the student was invited to
      try {
        const pendingEnrollments = await client.query(
          'SELECT * FROM pending_class_enrollments WHERE email = $1',
          [email]
        )
        
        for (const enrollment of pendingEnrollments.rows) {
          try {
            // Add student to class_students
            await client.query(
              `INSERT INTO class_students (class_id, student_id, student_masked_id) 
               VALUES ($1, $2, $3) 
               ON CONFLICT (class_id, student_id) DO NOTHING`,
              [enrollment.class_id, newUser.id, getMaskedId(newUser.id)]
            )
            // Remove pending enrollment
            await client.query(
              'DELETE FROM pending_class_enrollments WHERE email = $1 AND class_id = $2',
              [email, enrollment.class_id]
            )
            console.log(`[VERIFY-OTP] Auto-enrolled user in class ${enrollment.class_id}`)
          } catch (enrollErr) {
            console.error(`[VERIFY-OTP] Failed to auto-enroll in class ${enrollment.class_id}:`, enrollErr)
          }
        }
      } catch (pendingErr) {
        console.error("[VERIFY-OTP] Error checking pending enrollments:", pendingErr)
      }

      // Create session
      const sessionId = createSession(newUser)

      return NextResponse.json({
        success: true,
        message: "Account created successfully!",
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
    } finally {
      client.release()
    }
  } catch (error) {
    console.error("[VERIFY-OTP] Error:", error)
    return NextResponse.json(
      { error: "Failed to verify code" },
      { status: 500 }
    )
  }
}

