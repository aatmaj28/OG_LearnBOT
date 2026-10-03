"use client"

import { AuthGuard } from "@/components/auth-guard"
import { VoiceMode } from "@/components/voice-mode"

// Shared by managers and employees: the voice view is the same for both, so no role is required
// beyond being signed in.
export default function VoicePage() {
  return (
    <AuthGuard>
      <VoiceMode />
    </AuthGuard>
  )
}
