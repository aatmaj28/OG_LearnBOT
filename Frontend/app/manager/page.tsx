"use client"

import { useEffect, useState } from "react"
import { FileWarning, Loader2, Printer, RefreshCw, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { p2api, pct, type DocGap, type Overview, type Report } from "./_p2/api"
import { DocsToImprove, EmployeeDialog, ReportView, Stat, TeamTable, TicketProgress, TopicHeatmap } from "./_p2/components"

export default function ManagerPage() {
  const [ov, setOv] = useState<Overview | null>(null)
  const [gaps, setGaps] = useState<DocGap[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "at_risk">("all")
  const [report, setReport] = useState<Report | null>(null)
  const [reportLoading, setReportLoading] = useState(false)

  const load = () => {
    setError(null)
    Promise.all([p2api.overview(), p2api.docGaps()])
      .then(([o, g]) => { setOv(o); setGaps(g) })
      .catch((e) => setError(e.message))
  }
  useEffect(load, [])

  async function generateReport() {
    setReportLoading(true)
    try {
      setReport(await p2api.report())
      setTimeout(() => document.getElementById("p2-report")?.scrollIntoView({ behavior: "smooth" }), 50)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setReportLoading(false)
    }
  }

  if (!ov) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        {error ? <span className="text-destructive">Could not load analytics: {error}</span> : <><Loader2 className="h-4 w-4 animate-spin" />Loading team analytics…</>}
      </div>
    )
  }

  const t = ov.team
  const rows = filter === "at_risk" ? ov.employees.filter((r) => r.at_risk) : ov.employees

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Manager dashboard</h1>
          <p className="text-sm text-muted-foreground">Who is progressing, what people don’t understand, and which docs need fixing.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button>
          <Button size="sm" onClick={generateReport} disabled={reportLoading}>
            {reportLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
            {reportLoading ? "Writing report…" : "Generate report"}
          </Button>
        </div>
      </header>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="New hires" value={t.employees} />
        <Stat label="Need attention" value={t.at_risk} sub={`${t.employees - t.at_risk} on track`} />
        <Stat label="Avg check score" value={pct(t.avg_score)} sub={`${t.checks_this_week} checks this week`} />
        <Stat label="Avg progress" value={pct(t.avg_progress)} />
        <Stat label="Questions this week" value={t.questions_this_week} sub={`${t.unanswered_this_week} unanswered`} />
        <Stat label="Experience rating" value={t.avg_rating ? `${t.avg_rating.toFixed(1)}/5` : "–"} sub={`${t.first_pr_merged} merged a first PR`} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>Flags: 3+ low scores in the last 10 checks, inactive 4+ days, or the same topic asked 5+ times in a week. Click a person for details.</CardDescription>
          <CardAction>
            <div className="flex rounded-lg border p-0.5 text-xs">
              {(["all", "at_risk"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`rounded-md px-2.5 py-1 ${filter === f ? "bg-secondary font-medium" : "text-muted-foreground"}`}>
                  {f === "all" ? `All (${t.employees})` : `Need attention (${t.at_risk})`}
                </button>
              ))}
            </div>
          </CardAction>
        </CardHeader>
        <CardContent><TeamTable rows={rows} onSelect={setSelected} /></CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Understanding by topic</CardTitle>
            <CardDescription>Average learning-check score per person and topic. Red columns are topics the whole team struggles with.</CardDescription>
          </CardHeader>
          <CardContent><TopicHeatmap heatmap={ov.heatmap} onSelect={setSelected} /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>First tickets</CardTitle>
            <CardDescription>Jira progress per new hire</CardDescription>
          </CardHeader>
          <CardContent><TicketProgress rows={ov.employees} /></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileWarning className="h-5 w-5" />Docs to improve</CardTitle>
          <CardDescription>Ranked by wrong answers, questions the assistant couldn’t answer, and “confusing” feedback.</CardDescription>
        </CardHeader>
        <CardContent><DocsToImprove gaps={gaps} /></CardContent>
      </Card>

      {report && (
        <section className="space-y-2">
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Print / save PDF</Button>
            <Button variant="ghost" size="sm" onClick={() => setReport(null)}><X className="mr-1 h-4 w-4" />Close</Button>
          </div>
          <ReportView markdown={report.markdown} generatedAt={report.generated_at} source={report.source} />
        </section>
      )}

      <EmployeeDialog id={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
