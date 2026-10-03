"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { BookOpen, CheckCircle2, ChevronRight, Code2, FileText, Loader2, RotateCcw, Sparkles, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import * as Voice from "@/components/voice/VoiceButton"
import {
  DEMO_EMPLOYEE_ID, p2api, pct, scoreFill, scoreInk,
  type CatalogTopic, type Chunk, type EmployeeDetail, type LearnResult, type LearnStart,
} from "@/app/manager/_p2/api"

const VoiceButton: any = (Voice as any).VoiceButton ?? (Voice as any).default

type Stage = "pick" | "read" | "quiz" | "done"

export default function LearnPage() {
  const employeeId = DEMO_EMPLOYEE_ID
  const [catalog, setCatalog] = useState<CatalogTopic[]>([])
  const [files, setFiles] = useState<string[]>([])
  const [me, setMe] = useState<EmployeeDetail | null>(null)
  const [custom, setCustom] = useState("")
  const [stage, setStage] = useState<Stage>("pick")
  const [session, setSession] = useState<LearnStart | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [qIndex, setQIndex] = useState(0)
  const [answer, setAnswer] = useState("")
  const [results, setResults] = useState<Record<string, LearnResult>>({})
  const [speak, setSpeak] = useState<string | null>(null)

  useEffect(() => {
    p2api.learnTopics().then((d) => { setCatalog(d.topics); setFiles(d.files) }).catch((e) => setError(e.message))
    p2api.employee(employeeId).then(setMe).catch(() => {})
  }, [employeeId])

  const myScores = useMemo(() => Object.fromEntries((me?.topics ?? []).map((t) => [t.topic, t.avg_score])), [me])
  const pathTopics = useMemo(() => {
    const order = me?.learning_path ?? []
    const inPath = catalog.filter((t) => order.includes(t.topic)).sort((a, b) => order.indexOf(a.topic) - order.indexOf(b.topic))
    return { inPath, other: catalog.filter((t) => !order.includes(t.topic)) }
  }, [catalog, me])
  const recommended = pathTopics.inPath.find((t) => (myScores[t.topic] ?? 0) < 0.7)?.topic

  async function begin(target: { topic?: string; path?: string }) {
    setError(null)
    setLoading("Preparing material and questions…")
    try {
      const s = await p2api.learnStart({ employee_id: employeeId, ...target })
      setSession(s); setResults({}); setQIndex(0); setAnswer(""); setSpeak(null)
      setStage("read")
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(null)
    }
  }

  async function submit() {
    if (!session || !answer.trim()) return
    const q = session.questions[qIndex]
    setError(null)
    setLoading("Grading against the source…")
    try {
      const r = await p2api.learnAnswer({ session_id: session.session_id, question_id: q.id, answer })
      setResults((prev) => ({ ...prev, [q.id]: r }))
      setSpeak(r.feedback)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(null)
    }
  }

  function next() {
    if (!session) return
    setAnswer(""); setSpeak(null)
    if (qIndex + 1 < session.questions.length) setQIndex(qIndex + 1)
    else { setStage("done"); p2api.employee(employeeId).then(setMe).catch(() => {}) }
  }

  function reset() {
    setStage("pick"); setSession(null); setResults({}); setError(null)
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Learn</h1>
          <p className="text-sm text-muted-foreground">Read real code and docs, then check your understanding. Answers are graded against the source.</p>
        </div>
        {stage !== "pick" && (
          <Button variant="outline" size="sm" onClick={reset}><RotateCcw className="mr-1 h-4 w-4" />Pick another topic</Button>
        )}
      </header>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}
      {loading && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />{loading}
        </div>
      )}

      {stage === "pick" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your learning path</CardTitle>
              <CardDescription>
                {me ? `${me.topics_mastered} of ${me.topics_total} topics mastered` : "Topics picked for your role"}
                {recommended && <> · next up: <span className="font-medium text-foreground">{recommended}</span></>}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {(pathTopics.inPath.length ? pathTopics.inPath : catalog).map((t) => (
                <TopicCard key={t.topic} t={t} score={myScores[t.topic]} recommended={t.topic === recommended}
                  disabled={!!loading} onClick={() => begin({ topic: t.topic })} />
              ))}
            </CardContent>
          </Card>

          {pathTopics.inPath.length > 0 && pathTopics.other.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">More topics</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {pathTopics.other.map((t) => (
                  <TopicCard key={t.topic} t={t} score={myScores[t.topic]} disabled={!!loading} onClick={() => begin({ topic: t.topic })} />
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Learn anything</CardTitle>
              <CardDescription>Type a topic (e.g. “how citations are built”) or a file path from the repository.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => {
                e.preventDefault()
                const v = custom.trim()
                if (v) begin(files.includes(v) ? { path: v } : { topic: v })
              }}>
                <Input list="p2-learn-files" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Topic or file path" />
                <datalist id="p2-learn-files">{files.slice(0, 500).map((f) => <option key={f} value={f} />)}</datalist>
                <Button type="submit" disabled={!custom.trim() || !!loading}>Start<ChevronRight className="ml-1 h-4 w-4" /></Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {session && stage === "read" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Step 1 of 2 · Read</p>
              <h2 className="text-lg font-semibold">{session.topic}</h2>
            </div>
            <Button onClick={() => setStage("quiz")}>I’ve read it, check me<ChevronRight className="ml-1 h-4 w-4" /></Button>
          </div>
          {session.material.map((c) => <MaterialBlock key={c.id} c={c} />)}
          <div className="flex justify-end">
            <Button onClick={() => setStage("quiz")}>Start the {session.questions.length} questions<ChevronRight className="ml-1 h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {session && stage === "quiz" && (() => {
        const q = session.questions[qIndex]
        const r = results[q.id]
        return (
          <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,22rem)]">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Question {qIndex + 1} of {session.questions.length}</p>
                  <Badge variant="secondary" className="capitalize">{q.type}</Badge>
                </div>
                <CardTitle className="text-base leading-relaxed">{q.q}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={4} disabled={!!r || !!loading}
                    placeholder="Answer in your own words, or use the mic"
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit() }} />
                  {VoiceButton && !r && (
                    <div className="shrink-0">
                      <VoiceButton onTranscript={(t: string) => setAnswer((a) => (a ? `${a} ${t}` : t))} speakText={null} />
                    </div>
                  )}
                </div>
                {!r ? (
                  <div className="flex justify-end"><Button onClick={submit} disabled={!answer.trim() || !!loading}>Submit answer</Button></div>
                ) : (
                  <ResultPanel r={r} speak={speak} onNext={next} last={qIndex + 1 === session.questions.length} />
                )}
              </CardContent>
            </Card>
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Source material</p>
              {session.material.map((c) => <MaterialBlock key={c.id} c={c} compact highlight={r?.citation.id === c.id} />)}
            </div>
          </div>
        )
      })()}

      {session && stage === "done" && (() => {
        const rs = Object.values(results)
        const avg = rs.length ? rs.reduce((s, r) => s + r.score, 0) / rs.length : 0
        const gaps = Array.from(new Set(rs.flatMap((r) => r.gap_concepts)))
        return (
          <Card>
            <CardHeader>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Check complete</p>
              <CardTitle>{session.topic}</CardTitle>
              <CardDescription>{rs.filter((r) => r.correct).length} of {session.questions.length} correct · average score {pct(avg)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <ul className="space-y-2">
                {session.questions.map((q) => {
                  const r = results[q.id]
                  return (
                    <li key={q.id} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                      {r?.correct ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0ca30c]" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#d03b3b]" />}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{q.q}</p>
                        {r && <p className="mt-1 text-muted-foreground">{r.feedback}</p>}
                      </div>
                      <ScorePill score={r?.score ?? null} />
                    </li>
                  )
                })}
              </ul>
              {gaps.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium">Concepts to review</p>
                  <div className="flex flex-wrap gap-2">{gaps.map((g) => <Badge key={g} variant="outline">{g}</Badge>)}</div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => begin(session.material[0] && !catalog.some((t) => t.topic === session.topic) ? { path: session.material[0].path } : { topic: session.topic })}>
                  <RotateCcw className="mr-1 h-4 w-4" />Try new questions
                </Button>
                <Button variant="outline" onClick={reset}>Another topic</Button>
                <Button variant="ghost" asChild><Link href="/employee/experience">How is onboarding going? Give feedback</Link></Button>
              </div>
            </CardContent>
          </Card>
        )
      })()}
    </div>
  )
}

function TopicCard({ t, score, recommended, disabled, onClick }: {
  t: CatalogTopic; score?: number | null; recommended?: boolean; disabled?: boolean; onClick: () => void
}) {
  const Icon = t.source_type === "doc" ? FileText : Code2
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`group flex items-start gap-3 rounded-lg border p-3 text-left transition hover:border-primary/60 hover:bg-accent disabled:opacity-60 ${recommended ? "border-primary/60 ring-1 ring-primary/30" : ""}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{t.topic}</p>
          {recommended && <Badge className="shrink-0"><Sparkles className="mr-1 h-3 w-3" />Next</Badge>}
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground">{t.path}{t.section ? ` · ${t.section}` : ""}</p>
      </div>
      <ScorePill score={score ?? null} />
    </button>
  )
}

function ScorePill({ score }: { score: number | null }) {
  if (score == null) return <span className="shrink-0 rounded-md border px-2 py-0.5 text-xs text-muted-foreground">new</span>
  return (
    <span className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums"
      style={{ background: scoreFill(score), color: scoreInk(score) }}>{pct(score)}</span>
  )
}

function MaterialBlock({ c, compact, highlight }: { c: Chunk; compact?: boolean; highlight?: boolean }) {
  const isDoc = c.source_type !== "code"
  const filesHref = `/employee/files?path=${encodeURIComponent(c.path)}&line=${c.start_line}`
  return (
    <div className={`overflow-hidden rounded-lg border bg-card ${highlight ? "ring-2 ring-primary" : ""}`}>
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 font-mono">
          {isDoc ? <FileText className="h-3.5 w-3.5 shrink-0" /> : <Code2 className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">{c.path}:{c.start_line}-{c.end_line}</span>
          {c.section && <span className="truncate text-muted-foreground">· {c.section}</span>}
        </span>
        <Link href={filesHref} className="shrink-0 text-primary hover:underline">Open file</Link>
      </div>
      <pre className={`overflow-auto p-3 text-xs leading-relaxed ${compact ? "max-h-56" : "max-h-[28rem]"} ${isDoc ? "whitespace-pre-wrap font-sans text-sm" : "font-mono"}`}>
        {isDoc ? c.text : numbered(c.text, c.start_line)}
      </pre>
    </div>
  )
}

function numbered(text: string, start: number) {
  const lines = text.split("\n")
  const w = String(start + lines.length).length
  return lines.map((l, i) => `${String(start + i).padStart(w)}  ${l}`).join("\n")
}

function ResultPanel({ r, speak, onNext, last }: { r: LearnResult; speak: string | null; onNext: () => void; last: boolean }) {
  return (
    <div className="space-y-3 rounded-lg border p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium">
          {r.correct ? <CheckCircle2 className="h-5 w-5 text-[#0ca30c]" /> : <XCircle className="h-5 w-5 text-[#d03b3b]" />}
          {r.correct ? "Correct" : "Not quite"}
        </span>
        <div className="flex items-center gap-2">
          {VoiceButton && <VoiceButton onTranscript={() => {}} speakText={speak} />}
          <ScorePill score={r.score} />
        </div>
      </div>
      <p className="text-sm leading-relaxed">{r.feedback}</p>
      {r.gap_concepts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Review:</span>
          {r.gap_concepts.map((g) => <Badge key={g} variant="outline">{g}</Badge>)}
        </div>
      )}
      {r.reference_answer && !r.correct && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Show model answer</summary>
          <p className="mt-2 rounded-md bg-muted/50 p-3">{r.reference_answer}</p>
        </details>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <Link href={`/employee/files?path=${encodeURIComponent(r.citation.path)}&line=${r.citation.start_line}`}
          className="flex items-center gap-1 font-mono text-xs text-primary hover:underline">
          <BookOpen className="h-3.5 w-3.5" />{r.citation.path}:{r.citation.start_line}-{r.citation.end_line}
        </Link>
        <Button size="sm" onClick={onNext}>{last ? "See results" : "Next question"}<ChevronRight className="ml-1 h-4 w-4" /></Button>
      </div>
    </div>
  )
}
