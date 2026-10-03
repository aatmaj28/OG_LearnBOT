"use client"

import { AuthGuard } from "@/components/auth-guard"
import { FacultyDashboard } from "@/components/faculty-dashboard"

export default function FacultyDashboardPage() {
  return (
    <AuthGuard requiredRole="faculty">
      <FacultyDashboard />
    </AuthGuard>
  )
}
