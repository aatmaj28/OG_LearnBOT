"use client"

// Team meetings: paste (or upload) a transcript, get structured minutes from the Meeting Minutes agent, browse
// past meetings. API: POST /api/team/summarize, GET /api/team/meetings, GET /api/team/meetings/{id}.
import { useEffect, useState } from "react"
import { CheckCircle2, FileUp, HelpCircle, ListChecks, Loader2, NotebookPen, Sparkles, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useEmployee } from "@/components/shell/employee-context"
import { API_BASE } from "@/src/lib/api"

type Minutes = {
  summary: string
  decisions: string[]
  action_items: { owner: string; task: string; due: string }[]
  notes: string[]
  open_questions: string[]
}
type Meeting = { id: string; title: string; attendees: string[]; created: string; transcript: string; minutes: Minutes }
type MeetingRow = { id: string; title: string; attendees: string[]; created: string; summary: string; action_items: number }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, { ...init, headers: { "Content-Type": "application/json" } })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(typeof body?.detail === "string" ? body.detail : `${res.status} ${res.statusText}`)
  }
  return res.json()
}

function Section({ icon: Icon, title, items }: { icon: typeof ListChecks; title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div>
      <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-800">
        <Icon className="h-4 w-4 text-blue-600" /> {title}
      </h4>
      <ul className="ml-5 list-disc space-y-0.5 text-sm text-gray-700">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  )
}

function MinutesView({ m }: { m: Meeting }) {
  const mm = m.minutes
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.title}</CardTitle>
        <CardDescription>
          {new Date(m.created).toLocaleString()} · {m.attendees.join(", ") || "No attendees listed"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed text-gray-800">{mm.summary}</p>
        <Section icon={CheckCircle2} title="Decisions" items={mm.decisions} />
        {mm.action_items.length > 0 && (
          <div>
            <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-800">
              <ListChecks className="h-4 w-4 text-blue-600" /> Action items
            </h4>
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500">
                  <tr><th className="px-3 py-1.5">Owner</th><th className="px-3 py-1.5">Task</th><th className="px-3 py-1.5">Due</th></tr>
                </thead>
                <tbody>
                  {mm.action_items.map((a, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-1.5 font-medium">{a.owner}</td>
                      <td className="px-3 py-1.5">{a.task}</td>
                      <td className="px-3 py-1.5 text-gray-600">{a.due || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <Section icon={NotebookPen} title="Notes" items={mm.notes} />
        <Section icon={HelpCircle} title="Open questions" items={mm.open_questions} />
      </CardContent>
    </Card>
  )
}

export default function TeamMeetingsPage() {
  const { employeeId } = useEmployee()
  const [title, setTitle] = useState("")
  const [attendees, setAttendees] = useState("")
  const [transcript, setTranscript] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meetings, setMeetings] = useState<MeetingRow[]>([])
  const [selected, setSelected] = useState<Meeting | null>(null)

  const refresh = () => call<MeetingRow[]>("/team/meetings").then(setMeetings).catch(() => {})
  useEffect(() => {
    refresh()
  }, [])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setTranscript(await f.text())
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""))
  }

  async function summarize(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const m = await call<Meeting>("/team/summarize", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim() || "Team meeting",
          attendees: attendees.split(",").map((a) => a.trim()).filter(Boolean),
          transcript,
          employee_id: employeeId,
        }),
      })
      setSelected(m)
      setTranscript("")
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 p-4 md:grid-cols-[1fr_320px] md:p-6">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" /> Meeting minutes
            </CardTitle>
            <CardDescription>Paste or upload a transcript. Minutes are generated locally on the GB10.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={summarize} className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sprint planning" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="attendees">Attendees (comma separated)</Label>
                  <Input id="attendees" value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="AJ, Priya, Sam" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="transcript">Transcript</Label>
                  <label className="flex cursor-pointer items-center gap-1 text-xs text-blue-700 hover:underline">
                    <FileUp className="h-3.5 w-3.5" /> Upload .txt / .md
                    <input type="file" accept=".txt,.md,.vtt,.srt,text/plain" className="hidden" onChange={onFile} />
                  </label>
                </div>
                <Textarea
                  id="transcript"
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder={"AJ: Let's freeze code at 5:15.\nSam: I'll record the voice demo tonight."}
                  className="min-h-48 font-mono text-xs"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" disabled={busy || !transcript.trim()}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {busy ? "Writing minutes…" : "Summarize"}
              </Button>
            </form>
          </CardContent>
        </Card>
        {selected && <MinutesView m={selected} />}
      </div>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Past meetings</CardTitle>
          <CardDescription>{meetings.length} saved</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {meetings.length === 0 && <p className="text-sm text-gray-500">No meetings yet.</p>}
          {meetings.map((m) => (
            <button
              key={m.id}
              onClick={() => call<Meeting>(`/team/meetings/${m.id}`).then(setSelected)}
              className={`block w-full rounded-md border p-2 text-left text-sm hover:bg-blue-50 ${selected?.id === m.id ? "border-blue-300 bg-blue-50" : ""}`}
            >
              <div className="font-medium text-gray-900">{m.title}</div>
              <div className="text-xs text-gray-500">{new Date(m.created).toLocaleString()}</div>
              <Badge variant="outline" className="mt-1 text-xs">{m.action_items} action items</Badge>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
