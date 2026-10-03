"use client"

// Employee chat (P1): ask about the assigned projects; answers cite files and lines. The voice button sends the
// transcript as a message and speaks the answer.
import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import { AlertTriangle, Bot, FileCode2, Loader2, MessageSquare, Send, Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { VoiceButton } from "@/components/voice/VoiceButton"
import { useEmployee } from "@/components/shell/employee-context"
import { api, type Chunk, type ChatResponse } from "@/src/lib/api"

type Message = { role: "user" | "assistant"; text: string; reply?: ChatResponse; error?: boolean }

const SUGGESTIONS = [
  "Where is the chat API implemented?",
  "How do I run the backend locally?",
  "How are documents indexed for search?",
]

function CitationChip({ c }: { c: Chunk }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={c.section}
        className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 font-mono text-xs text-blue-700 hover:bg-blue-100"
      >
        <FileCode2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {c.path}:{c.start_line}-{c.end_line}
        </span>
      </button>
      {open && (
        <pre className="mt-1 max-h-72 overflow-auto rounded-md border bg-gray-50 p-2 text-xs leading-relaxed">
          {c.text.split("\n").map((line, i) => (
            <div key={i}>
              <span className="mr-3 inline-block w-8 select-none text-right text-gray-400">{c.start_line + i}</span>
              {line}
            </div>
          ))}
        </pre>
      )}
    </div>
  )
}

export default function ChatPage() {
  const { employeeId, employee } = useEmployee()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [speak, setSpeak] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, busy])
  useEffect(() => {
    setMessages([])
  }, [employeeId])

  async function send(text: string) {
    const message = text.trim()
    if (!message || busy) return
    setInput("")
    setSpeak(null)
    setMessages((m) => [...m, { role: "user", text: message }])
    setBusy(true)
    try {
      const reply = await api.chat({ message, employee_id: employeeId })
      setMessages((m) => [...m, { role: "assistant", text: reply.answer, reply }])
      setSpeak(reply.answer.replace(/[`*#_>|]/g, ""))
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", text: `Something went wrong: ${err instanceof Error ? err.message : err}`, error: true }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8.5rem)] w-full max-w-4xl flex-col p-4 md:p-6">
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="mt-10 text-center">
            <div className="mx-auto mb-3 w-fit rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-3 shadow-md">
              <MessageSquare className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Hi{employee ? ` ${employee.name.split(" ")[0]}` : ""}, ask about the codebase</h2>
            <p className="mt-1 text-sm text-gray-600">Answers come from your projects, with file and line citations.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s} variant="outline" size="sm" onClick={() => send(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2 text-sm text-white">
              {m.text}
            </div>
          ) : (
            <div key={i} className="flex gap-3">
              <div className="mt-1 h-fit rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 p-1.5">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div className={`min-w-0 flex-1 space-y-3 rounded-2xl rounded-tl-sm border bg-white px-4 py-3 text-sm shadow-sm ${m.error ? "border-red-200 text-red-700" : ""}`}>
                {m.reply?.unanswered && (
                  <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-800">
                    <AlertTriangle className="h-3 w-3" /> Not covered by the docs (flagged for your manager)
                  </Badge>
                )}
                <div className="prose prose-sm max-w-none prose-pre:bg-gray-50 prose-pre:text-gray-800">
                  <ReactMarkdown>{m.text}</ReactMarkdown>
                </div>
                {!!m.reply?.citations.length && (
                  <div className="space-y-1.5">
                    {m.reply.citations.map((c) => (
                      <CitationChip key={c.id} c={c} />
                    ))}
                  </div>
                )}
                {!!m.reply?.steps.length && (
                  <p className="flex items-start gap-1.5 text-xs text-gray-500">
                    <Wrench className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>Agent steps: {m.reply.steps.join(" → ")}</span>
                  </p>
                )}
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Searching the codebase…
          </div>
        )}
        <div ref={bottom} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="flex items-center gap-2 rounded-xl border bg-white p-2 shadow-sm"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the code, setup or docs…"
          className="border-0 shadow-none focus-visible:ring-0"
          disabled={busy}
        />
        <VoiceButton onTranscript={(t) => send(t)} speakText={speak} />
        <Button type="submit" disabled={busy || !input.trim()} aria-label="Send">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  )
}
