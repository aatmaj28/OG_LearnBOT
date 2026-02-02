"use client"

import { AuthGuard } from "@/components/auth-guard"
import { StudentChatInterface } from "@/components/student-chat-interface"

export default function StudentChatPage() {
  return (
    <AuthGuard requiredRole="student">
      <StudentChatInterface />
    </AuthGuard>
  )
}
