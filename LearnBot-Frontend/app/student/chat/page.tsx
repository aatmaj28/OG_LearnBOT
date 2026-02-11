"use client"

import { AuthGuard } from "@/components/auth-guard"
import { StudentDashboard } from "@/components/student-dashboard"

export default function StudentChatPage() {
  return (
    <AuthGuard requiredRole="student">
      <StudentDashboard />
    </AuthGuard>
  )
}
