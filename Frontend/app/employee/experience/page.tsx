"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Loader2, Plus, Star, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DEMO_EMPLOYEE_ID, daysAgo, p2api, type CatalogTopic, type EventRow } from "@/app/manager/_p2/api"

const RATING_LABELS = ["", "Very hard", "Hard", "Okay", "Good", "Great"]

export default function ExperiencePage() {
  const employeeId = DEMO_EMPLOYEE_ID
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [understood, setUnderstood] = useState<string[]>([])
  const [confusing, setConfusing] = useState<string[]>([])
  const [comment, setComment] = useState("")
  const [catalog, setCatalog] = useState<CatalogTopic[]>([])
  const [history, setHistory] = useState<EventRow[]>([])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadHistory = () => p2api.experienceHistory(employeeId).then(setHistory).catch(() => {})
  useEffect(() => {
    p2api.learnTopics().then((d) => setCatalog(d.topics)).catch(() => {})
    loadHistory()
  }, [employeeId])

  const topicSuggestions = catalog.map((t) => t.topic)
  const sectionSuggestions = catalog.map((t) => `${t.path} › ${t.section}`)

  async function submit() {
    if (!rating) { setError("Pick a rating first."); return }
    setError(null); setSending(true)
    try {
      await p2api.sendExperience({ employee_id: employeeId, rating, understood, confusing, comment })
      setSent(true); setRating(0); setUnderstood([]); setConfusing([]); setComment("")
      loadHistory()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Your onboarding experience</h1>
        <p className="text-sm text-muted-foreground">Tell us what clicked and what didn’t. Confusing docs go straight to your manager’s “Docs to improve” list.</p>
      </header>

      {sent && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-[#0ca30c]/40 bg-[#0ca30c]/5 px-4 py-3 text-sm">
          <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#0ca30c]" />Thanks! Your feedback was saved.</span>
          <button onClick={() => setSent(false)} aria-label="Dismiss"><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
      )}

      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="space-y-2">
            <Label>How is onboarding going so far?</Label>
            <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-label={`${n} — ${RATING_LABELS[n]}`}
                  onMouseEnter={() => setHover(n)} onClick={() => { setRating(n); setSent(false) }} className="p-1">
                  <Star className={`h-7 w-7 transition ${(hover || rating) >= n ? "fill-[#fab219] text-[#fab219]" : "text-muted-foreground/40"}`} />
                </button>
              ))}
              <span className="ml-2 text-sm text-muted-foreground">{RATING_LABELS[hover || rating]}</span>
            </div>
          </div>

          <ChipInput id="understood" label="What did you understand well?" placeholder="e.g. Chat API & citations"
            values={understood} onChange={setUnderstood} suggestions={topicSuggestions} />
          <ChipInput id="confusing" label="What was confusing?" placeholder="A topic, file or doc section"
            hint="Pick a doc section if you can; it tells your manager exactly what to fix."
            values={confusing} onChange={setConfusing} suggestions={[...sectionSuggestions, ...topicSuggestions]} />

          <div className="space-y-2">
            <Label htmlFor="comment">Anything else?</Label>
            <Textarea id="comment" rows={4} value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder="What slowed you down? What would have helped on day one?" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end">
            <Button onClick={submit} disabled={sending}>{sending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Send feedback</Button>
          </div>
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your previous feedback</CardTitle>
            <CardDescription>{history.length} submissions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {history.map((h, i) => (
              <div key={i} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-0.5" aria-label={`${h.details.rating} of 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={`h-3.5 w-3.5 ${h.details.rating >= n ? "fill-[#fab219] text-[#fab219]" : "text-muted-foreground/30"}`} />
                    ))}
                  </span>
                  <span className="text-xs text-muted-foreground">{daysAgo(h.ts)}</span>
                </div>
                {h.details.comment && <p className="mt-2">{h.details.comment}</p>}
                {(h.details.confusing?.length ?? 0) > 0 && (
                  <p className="mt-1 text-muted-foreground">Confusing: {h.details.confusing.join(", ")}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ChipInput({ id, label, hint, placeholder, values, onChange, suggestions }: {
  id: string; label: string; hint?: string; placeholder: string
  values: string[]; onChange: (v: string[]) => void; suggestions: string[]
}) {
  const [draft, setDraft] = useState("")
  const add = (v: string) => {
    const s = v.trim()
    if (s && !values.includes(s)) onChange([...values, s])
    setDraft("")
  }
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-md border bg-secondary px-2 py-1 text-xs">
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input id={id} list={`${id}-suggest`} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft) } }} />
        <datalist id={`${id}-suggest`}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        <Button type="button" variant="outline" size="icon" onClick={() => add(draft)} aria-label="Add"><Plus className="h-4 w-4" /></Button>
      </div>
    </div>
  )
}
