"use client"

import { useEffect, useState } from "react"
import ReactMarkdown from "react-markdown"
import { AlertTriangle, CheckCircle2, Circle, Clock, FileText, Code2, GitMerge, Loader2, MessageCircleQuestion, Repeat, Ticket as TicketIcon, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { daysAgo, p2api, pct, scoreFill, scoreInk, type DocGap, type EmployeeDetail, type EmployeeRow, type Flag, type Overview } from "./api"

// ---------- small pieces ----------

export function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{pct(value)}</span>
    </div>
  )
}

const FLAG_ICON = { low_scores: AlertTriangle, inactive: Clock, repeat_topic: Repeat } as const

export function FlagBadge({ f }: { f: Flag }) {
  const Icon = FLAG_ICON[f.code] ?? AlertTriangle
  const color = f.code === "low_scores" ? "#d03b3b" : f.code === "inactive" ? "#b7791f" : "#c2410c"
  return (
    <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs" style={{ borderColor: `${color}55`, color }}>
      <Icon className="h-3 w-3" />{f.label}
    </span>
  )
}

function Milestone({ done, label, date }: { done: boolean; label: string; date?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs" title={date ? `${label}: ${date}` : `${label}: not yet`}>
      {done ? <CheckCircle2 className="h-3.5 w-3.5 text-[#0ca30c]" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />}
      <span className={done ? "" : "text-muted-foreground"}>{label}</span>
    </span>
  )
}

// ---------- team table ----------

export function TeamTable({ rows, onSelect }: { rows: EmployeeRow[]; onSelect: (id: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56rem] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">New hire</th>
            <th className="py-2 pr-3 font-medium">Progress</th>
            <th className="py-2 pr-3 text-right font-medium">Avg score</th>
            <th className="py-2 pr-3 font-medium">Topics</th>
            <th className="py-2 pr-3 font-medium">Milestones</th>
            <th className="py-2 pr-3 font-medium">Last active</th>
            <th className="py-2 font-medium">Attention</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} onClick={() => onSelect(r.id)} className={`cursor-pointer border-b last:border-0 hover:bg-accent/60 ${r.at_risk ? "bg-[#d03b3b]/[0.03]" : ""}`}>
              <td className="py-2.5 pr-3">
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.role} · day {r.days_since_start ?? "–"} · {r.manager}</p>
              </td>
              <td className="py-2.5 pr-3"><ProgressBar value={r.progress} /></td>
              <td className="py-2.5 pr-3 text-right">
                <span className="rounded px-1.5 py-0.5 tabular-nums" style={{ background: scoreFill(r.avg_score), color: scoreInk(r.avg_score) }}>{pct(r.avg_score)}</span>
              </td>
              <td className="py-2.5 pr-3 text-xs tabular-nums">{r.topics_mastered}/{r.topics_total} mastered</td>
              <td className="py-2.5 pr-3">
                <div className="flex flex-col gap-0.5">
                  <Milestone done={!!r.milestones.first_ticket_assigned} label="First ticket" date={r.milestones.first_ticket_assigned} />
                  <Milestone done={!!r.milestones.first_pr_merged} label="First PR merged" date={r.milestones.first_pr_merged} />
                </div>
              </td>
              <td className="py-2.5 pr-3 text-xs text-muted-foreground">{daysAgo(r.last_active)}</td>
              <td className="py-2.5">
                {r.flags.length ? (
                  <div className="flex flex-col items-start gap-1">{r.flags.map((f) => <FlagBadge key={f.code} f={f} />)}</div>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-[#0ca30c]"><CheckCircle2 className="h-3.5 w-3.5" />On track</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------- heatmap ----------

export function TopicHeatmap({ heatmap, onSelect }: { heatmap: Overview["heatmap"]; onSelect: (id: string) => void }) {
  const [hover, setHover] = useState<{ name: string; topic: string; score: number | null } | null>(null)
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[2px] text-xs">
          <thead>
            <tr>
              <th />
              {heatmap.topics.map((t) => (
                <th key={t} className="h-32 w-11 align-bottom font-normal text-muted-foreground">
                  <div className="mx-auto w-4 whitespace-nowrap [writing-mode:vertical-rl] rotate-180 text-left">{t}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmap.rows.map((r) => (
              <tr key={r.employee_id}>
                <th className="whitespace-nowrap pr-2 text-left font-normal">
                  <button className="hover:underline" onClick={() => onSelect(r.employee_id)}>{r.name}</button>
                </th>
                {r.scores.map((s, i) => (
                  <td key={i}
                    onMouseEnter={() => setHover({ name: r.name, topic: heatmap.topics[i], score: s })}
                    onMouseLeave={() => setHover(null)}
                    title={`${r.name} · ${heatmap.topics[i]}: ${s == null ? "not attempted" : pct(s)}`}
                    className={`h-8 w-11 rounded text-center tabular-nums ${s == null ? "border border-dashed text-muted-foreground/50" : ""}`}
                    style={{ background: scoreFill(s), color: scoreInk(s) }}>
                    {s == null ? "·" : Math.round(s * 100)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Avg check score</span>
          <span>0</span>
          <span className="h-2.5 w-40 rounded-sm" style={{ background: "linear-gradient(to right, #e34948, #f0efec 60%, #2a78d6)" }} />
          <span>100</span>
          <span className="ml-1">· gray = pass mark (60)</span>
        </div>
        <span className="min-h-4 tabular-nums">{hover ? `${hover.name} · ${hover.topic}: ${hover.score == null ? "not attempted" : pct(hover.score)}` : "Hover a cell for details"}</span>
      </div>
    </div>
  )
}

// ---------- docs to improve ----------

const SEVERITY = {
  high: { label: "High", color: "#d03b3b" },
  medium: { label: "Medium", color: "#c2410c" },
  low: { label: "Low", color: "#898781" },
}

export function DocsToImprove({ gaps }: { gaps: DocGap[] }) {
  if (!gaps.length) return <p className="text-sm text-muted-foreground">No documentation problems detected yet.</p>
  return (
    <ol className="space-y-3">
      {gaps.map((g, i) => {
        const sev = SEVERITY[g.severity] ?? SEVERITY.low
        const Icon = g.source_type === "doc" ? FileText : Code2
        return (
          <li key={`${g.path}-${g.section}-${i}`} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-mono text-sm font-medium">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{g.path}</span>
                </p>
                {g.section && <p className="mt-0.5 text-sm text-muted-foreground">{g.section}{g.topic ? ` · ${g.topic}` : ""}</p>}
              </div>
              <span className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium" style={{ borderColor: `${sev.color}66`, color: sev.color }}>
                <AlertTriangle className="h-3 w-3" />{sev.label} impact
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              {g.attempts > 0 && <span><b className="text-foreground tabular-nums">{pct(g.wrong_rate)}</b> wrong answers ({g.wrong_answers}/{g.attempts})</span>}
              {g.unanswered > 0 && <span className="inline-flex items-center gap-1"><MessageCircleQuestion className="h-3 w-3" /><b className="text-foreground tabular-nums">{g.unanswered}</b> unanswered questions</span>}
              {g.confused_mentions > 0 && <span><b className="text-foreground tabular-nums">{g.confused_mentions}</b> “confusing” reports</span>}
              <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /><b className="text-foreground tabular-nums">{g.affected_employees}</b> people affected</span>
            </div>
            {g.gap_concepts.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">{g.gap_concepts.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}</div>
            )}
            <p className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-sm"><span className="font-medium">Fix: </span>{g.suggestion}</p>
            {(g.sample_questions.length > 0 || g.comments.length > 0) && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-xs text-muted-foreground">What people asked / said</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  {g.sample_questions.map((q) => <li key={q}>“{q}”</li>)}
                  {g.comments.map((c) => <li key={c} className="italic">{c}</li>)}
                </ul>
              </details>
            )}
          </li>
        )
      })}
    </ol>
  )
}

// ---------- Jira-like progress ----------

export function TicketProgress({ rows }: { rows: EmployeeRow[] }) {
  const withTickets = rows.filter((r) => r.milestones.tickets_total > 0)
  const firstTicket = rows.filter((r) => r.milestones.first_ticket_assigned).length
  const firstPr = rows.filter((r) => r.milestones.first_pr_merged).length
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Funnel icon={TicketIcon} label="Got a first ticket" n={firstTicket} total={rows.length} />
        <Funnel icon={GitMerge} label="Merged a first PR" n={firstPr} total={rows.length} />
      </div>
      <ul className="space-y-2">
        {withTickets.map((r) => {
          const frac = r.milestones.tickets_done / r.milestones.tickets_total
          return (
            <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">{r.name}</span>
              <span className="flex items-center gap-2">
                <span className="flex gap-0.5">
                  {Array.from({ length: r.milestones.tickets_total }).map((_, i) => (
                    <span key={i} className={`h-2.5 w-4 rounded-sm ${i < r.milestones.tickets_done ? "bg-[#2a78d6]" : "bg-muted"}`} />
                  ))}
                </span>
                <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">{r.milestones.tickets_done}/{r.milestones.tickets_total} done</span>
              </span>
              <span className="sr-only">{pct(frac)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Funnel({ icon: Icon, label, n, total }: { icon: any; label: string; n: number; total: number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{n}<span className="text-sm font-normal text-muted-foreground"> / {total}</span></p>
    </div>
  )
}

// ---------- employee detail ----------

const STATUS: Record<string, { label: string; cls: string }> = {
  done: { label: "Done", cls: "bg-[#0ca30c]/10 text-[#0a7d0a]" },
  in_review: { label: "In review", cls: "bg-[#2a78d6]/10 text-[#2a78d6]" },
  in_progress: { label: "In progress", cls: "bg-[#fab219]/15 text-[#8a5a00]" },
  todo: { label: "To do", cls: "bg-muted text-muted-foreground" },
}

export function EmployeeDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [d, setD] = useState<EmployeeDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    setD(null); setErr(null)
    if (id) p2api.employee(id).then(setD).catch((e) => setErr(e.message))
  }, [id])

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        {!d ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            {err ?? <><Loader2 className="h-4 w-4 animate-spin" />Loading…</>}
            <DialogTitle className="sr-only">Employee</DialogTitle>
          </div>
        ) : (
          <div className="space-y-5">
            <DialogHeader>
              <DialogTitle>{d.name}</DialogTitle>
              <DialogDescription>
                {d.role} · started {d.start_date} (day {d.days_since_start}) · {d.manager} ({d.manager_type} manager)
              </DialogDescription>
            </DialogHeader>
            {d.flags.length > 0 && <div className="flex flex-wrap gap-2">{d.flags.map((f) => <FlagBadge key={f.code} f={f} />)}</div>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Progress" value={pct(d.progress)} />
              <Stat label="Avg score" value={pct(d.avg_score)} sub={`recent ${pct(d.recent_avg_score)}`} />
              <Stat label="Questions" value={d.questions_asked} sub={`${d.unanswered} unanswered`} />
              <Stat label="Rating" value={d.avg_rating ? `${(d.avg_rating).toFixed(1)}/5` : "–"} />
            </div>

            <section>
              <h3 className="mb-2 text-sm font-medium">Learning path</h3>
              <div className="flex flex-wrap gap-1.5">
                {d.learning_path.map((t) => {
                  const s = d.topics.find((x) => x.topic === t)?.avg_score ?? null
                  return (
                    <span key={t} className={`rounded-md px-2 py-1 text-xs ${s == null ? "border border-dashed text-muted-foreground" : ""}`}
                      style={{ background: scoreFill(s), color: scoreInk(s) }}>
                      {t}{s != null && <b className="ml-1 tabular-nums">{Math.round(s * 100)}</b>}
                    </span>
                  )
                })}
              </div>
            </section>

            {d.top_gaps.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-medium">Concepts they struggle with</h3>
                <div className="flex flex-wrap gap-1.5">{d.top_gaps.map((g) => <Badge key={g.concept} variant="outline">{g.concept} ×{g.count}</Badge>)}</div>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-sm font-medium">Tickets</h3>
              <ul className="divide-y rounded-lg border text-sm">
                {d.tickets.length === 0 && <li className="p-3 text-muted-foreground">No tickets yet</li>}
                {d.tickets.map((t) => (
                  <li key={t.key} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate"><span className="mr-2 font-mono text-xs text-muted-foreground">{t.key}</span>{t.title}</span>
                    <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${STATUS[t.status]?.cls ?? ""}`}>{STATUS[t.status]?.label ?? t.status}</span>
                  </li>
                ))}
              </ul>
            </section>

            {d.unanswered_questions.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-medium">Questions the assistant couldn’t answer</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {d.unanswered_questions.map((q, i) => <li key={i}>“{q.question}” <span className="text-xs">· {q.topic} · {daysAgo(q.ts)}</span></li>)}
                </ul>
              </section>
            )}

            {d.feedback.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-medium">Their feedback</h3>
                <ul className="space-y-2 text-sm">
                  {d.feedback.slice(0, 4).map((f, i) => (
                    <li key={i} className="rounded-md bg-muted/50 px-3 py-2">
                      <span className="tabular-nums font-medium">{f.rating}/5</span> · {f.comment}
                      {(f.confusing?.length ?? 0) > 0 && <span className="block text-xs text-muted-foreground">Confusing: {f.confusing!.join(", ")}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------- report ----------

export function ReportView({ markdown, generatedAt, source }: { markdown: string; generatedAt: string; source: string }) {
  return (
    <article id="p2-report" className="rounded-xl border bg-card p-6">
      <header className="mb-4 border-b pb-3">
        <h2 className="text-xl font-semibold">Onboarding report</h2>
        <p className="text-xs text-muted-foreground">
          Generated {new Date(generatedAt).toLocaleString()} · {source === "llm" ? "written by the local model" : "template (model unavailable)"}
        </p>
      </header>
      <div className="space-y-3 text-sm leading-relaxed [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc [&_ul]:space-y-1.5">
        <ReactMarkdown>{markdown}</ReactMarkdown>
      </div>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #p2-report, #p2-report * { visibility: visible !important; }
          #p2-report { position: absolute; inset: 0 auto auto 0; width: 100%; border: 0; box-shadow: none; }
        }
      `}</style>
    </article>
  )
}
