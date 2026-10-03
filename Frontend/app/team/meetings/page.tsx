"use client"

// STUB from the skeleton (P1); P3 builds the Team Meetings page: record or paste a meeting, summarize it with
// POST /api/team/summarize, list GET /api/team/meetings.
import { Users } from "lucide-react"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function TeamMeetingsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" /> Team meetings
          </CardTitle>
          <CardDescription>Meeting minutes from recorded or pasted meetings. Coming soon.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
