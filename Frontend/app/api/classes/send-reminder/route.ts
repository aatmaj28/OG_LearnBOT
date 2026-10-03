import { type NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"

export async function POST(request: NextRequest) {
  try {
    const { emails, className, facultyName } = await request.json()

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: "Email list is required" }, { status: 400 })
    }

    if (!className) {
      return NextResponse.json({ error: "Class name is required" }, { status: 400 })
    }

    // Get Gmail credentials from environment variables
    const gmailUser = process.env.GMAIL_USER
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD

    if (!gmailUser || !gmailAppPassword) {
      console.error("Gmail credentials not configured")
      return NextResponse.json({ error: "Email service not configured" }, { status: 500 })
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    })

    // Get the registration URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.headers.get('origin') || 'http://localhost:3000'
    const registrationUrl = `${baseUrl}/register`

    // Send email to each employee
    const results = {
      success: [] as string[],
      failed: [] as string[],
    }

    for (const email of emails) {
      try {
        await transporter.sendMail({
          from: `"LearnBOT" <${gmailUser}>`,
          to: email,
          subject: `Action Required: Register for ${className} on LearnBOT`,
          html: `
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
                .header {
                  background-color: #4F46E5;
                  color: white;
                  padding: 20px;
                  text-align: center;
                  border-radius: 8px 8px 0 0;
                }
                .content {
                  background-color: #f9fafb;
                  padding: 30px;
                  border: 1px solid #e5e7eb;
                }
                .button {
                  display: inline-block;
                  background-color: #4F46E5;
                  color: white;
                  padding: 12px 30px;
                  text-decoration: none;
                  border-radius: 6px;
                  margin: 20px 0;
                  font-weight: bold;
                }
                .footer {
                  background-color: #f3f4f6;
                  padding: 20px;
                  text-align: center;
                  font-size: 12px;
                  color: #6b7280;
                  border-radius: 0 0 8px 8px;
                }
                .class-name {
                  color: #4F46E5;
                  font-weight: bold;
                }
              </style>
            </head>
            <body>
              <div class="header">
                <h1>LearnBOT Registration Required</h1>
              </div>
              <div class="content">
                <p>Hello,</p>
                
                <p>${facultyName ? `Your manager ${facultyName}` : 'Your manager'} attempted to add you to the sector <span class="class-name">${className}</span> on LearnBOT, but your account was not found in our system.</p>

                <p><strong>To gain access to the sector, you need to register on LearnBOT first.</strong></p>
                
                <p>Click the button below to register:</p>
                
                <div style="text-align: center;">
                  <a href="${registrationUrl}" class="button">Register Now</a>
                </div>
                
                <p>Or copy and paste this link into your browser:</p>
                <p style="background-color: white; padding: 10px; border: 1px solid #e5e7eb; border-radius: 4px; word-break: break-all;">
                  ${registrationUrl}
                </p>
                
                <p><strong>Important:</strong> Please use this same email address (${email}) when you register so you are added to the sector automatically.</p>

                <p>Once you complete your registration, your manager will be able to add you to the sector.</p>

                <p>If you have any questions or need assistance, please contact your manager.</p>
                
                <p>Best regards,<br>The LearnBOT Team</p>
              </div>
              <div class="footer">
                <p>This is an automated message from LearnBOT. Please do not reply to this email.</p>
                <p>&copy; ${new Date().getFullYear()} LearnBOT. All rights reserved.</p>
              </div>
            </body>
            </html>
          `,
          text: `
Hello,

${facultyName ? `Your manager ${facultyName}` : 'Your manager'} attempted to add you to the sector "${className}" on LearnBOT, but your account was not found in our system.

To gain access to the sector, you need to register on LearnBOT first.

Please visit the following link to register:
${registrationUrl}

Important: Please use this same email address (${email}) when you register so you are added to the sector automatically.

Once you complete your registration, your manager will be able to add you to the sector.

If you have any questions or need assistance, please contact your manager.

Best regards,
The LearnBOT Team

---
This is an automated message from LearnBOT.
          `,
        })

        results.success.push(email)
        console.log(`[Send Reminder] Email sent successfully to ${email}`)
      } catch (error) {
        console.error(`[Send Reminder] Failed to send email to ${email}:`, error)
        results.failed.push(email)
      }
    }

    return NextResponse.json({
      message: "Reminder emails processed",
      results,
    })
  } catch (error) {
    console.error("[Send Reminder] Error:", error)
    return NextResponse.json({ error: "Failed to send reminder emails" }, { status: 500 })
  }
}

