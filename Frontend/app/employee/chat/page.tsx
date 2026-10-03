"use client"

// Employee chat (P1). Skeleton: one question -> answer with citations; the full page lands on AJ.
import { useState } from "react"
import { Loader2, MessageSquare, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useEmployee } from "@/components/shell/employee-context"
import { api, type ChatResponse } from "@/src/lib/api"

export default function ChatPage() {
  const { employeeId } = useEmployee()
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState<ChatResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setBusy(true)
    setError(null)
    try {
      setReply(await api.chat({ message, employee_id: employeeId }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-600" /> Ask about the codebase
          </CardTitle>
          <CardDescription>Answers come with file and line citations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={send} className="flex gap-2">
            <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="How does search work?" />
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {reply && (
            <div className="space-y-2 text-sm">
              <p className="whitespace-pre-wrap">{reply.answer}</p>
              <ul className="text-gray-600">
                {reply.citations.map((c) => (
                  <li key={c.id}>
                    {c.path}:{c.start_line}-{c.end_line}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
