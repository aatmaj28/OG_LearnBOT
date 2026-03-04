"""
Email Service
Migrated from app/api/auth/send-otp/route.ts

Handles sending verification emails
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import Config

def send_verification_email(email: str, otp: str, name: str) -> dict:
    """
    Sends verification email using Gmail
    
    Returns:
        dict with 'success' key
    """
    gmail_user = Config.GMAIL_USER
    gmail_app_password = Config.GMAIL_APP_PASSWORD
    
    # If no credentials, fall back to console logging
    if not gmail_user or not gmail_app_password:
        print(f"""
╔══════════════════════════════════════════════════════════════╗
║                    EMAIL VERIFICATION                        ║
╠══════════════════════════════════════════════════════════════╣
║ To: {email:<55}║
║                                                              ║
║ Subject: LearnBOT Portal - Email Verification               ║
║                                                              ║
║ Welcome to LearnBOT Portal!                                 ║
║                                                              ║
║ Hello {name:<51}║
║                                                              ║
║ Please use the verification code below to complete          ║
║ your registration.                                           ║
║                                                              ║
║ Your verification code is:                                   ║
║                                                              ║
║                       {otp}                                ║
║                                                              ║
║ This code expires in 10 minutes.                             ║
║                                                              ║
║ If you didn't request this verification, please ignore      ║
║ this email.                                                  ║
║                                                              ║
║ © 2024 LearnBOT Portal - Northeastern University            ║
╚══════════════════════════════════════════════════════════════╝
        """)
        print('⚠️  Gmail credentials not configured. Email logged to console only.')
        print('   To enable real emails, add GMAIL_USER and GMAIL_APP_PASSWORD to .env')
        return {'success': True}
    
    try:
        # Create message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = 'LearnBOT Portal - Email Verification'
        msg['From'] = f'"LearnBOT Portal" <{gmail_user}>'
        msg['To'] = email
        
        # HTML content
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
  <style>
    body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }}
    .container {{ background-color: #f9f9f9; border: 1px solid #ddd; border-radius: 10px; padding: 30px; }}
    .header {{ text-align: center; margin-bottom: 30px; }}
    .header h1 {{ color: #2563eb; margin: 0; font-size: 28px; }}
    .otp-box {{ background-color: #f0f7ff; border: 2px solid #2563eb; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0; }}
    .otp-code {{ font-size: 36px; font-weight: bold; color: #2563eb; letter-spacing: 8px; font-family: 'Courier New', monospace; }}
    .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 12px; color: #666; }}
    .warning {{ background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 5px; padding: 15px; margin-top: 20px; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>LearnBOT Portal</h1>
      <p>Email Verification</p>
    </div>
    <p>Hello <strong>{name}</strong>,</p>
    <p>Welcome to <strong>LearnBOT Portal</strong> at Northeastern University!</p>
    <p>Please use the verification code below to complete your registration:</p>
    <div class="otp-box">
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Your verification code is:</p>
      <div class="otp-code">{otp}</div>
    </div>
    <p><strong>This code expires in 10 minutes.</strong></p>
    <div class="warning">
      <p style="margin: 0;"><strong>⚠️ Security Note:</strong> If you didn't request this verification, please ignore this email. Never share this code with anyone.</p>
    </div>
    <div class="footer">
      <p>© 2024 LearnBOT Portal - Northeastern University</p>
      <p>This is an automated message, please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
        """
        
        text_content = f"""Welcome to LearnBOT Portal!

Hello {name},

Your verification code is: {otp}

This code expires in 10 minutes.

If you didn't request this verification, please ignore this email.

© 2024 LearnBOT Portal - Northeastern University
        """
        
        part1 = MIMEText(text_content, 'plain')
        part2 = MIMEText(html_content, 'html')
        
        msg.attach(part1)
        msg.attach(part2)
        
        # Send email
        with smtplib.SMTP('smtp.gmail.com', 587) as server:
            server.starttls()
            server.login(gmail_user, gmail_app_password)
            server.send_message(msg)
        
        print(f'✅ Verification email sent successfully to {email}')
        return {'success': True}
    except Exception as e:
        print(f'❌ Failed to send email: {e}')
        raise Exception('Failed to send verification email')
