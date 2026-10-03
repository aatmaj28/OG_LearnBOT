// API client + types for Learn, Experience and Manager pages (Person 2).
// Same-origin in prod (FastAPI serves the static build); set NEXT_PUBLIC_API_BASE
// (e.g. http://localhost:8000) when running `next dev` against a local backend.

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? ""
export const DEMO_EMPLOYEE_ID = process.env.NEXT_PUBLIC_DEMO_EMPLOYEE_ID ?? "emp_demo"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail)
    } catch {}
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

const post = <T,>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) })

export type Chunk = {
  id: string
  source_type: "code" | "doc" | "meeting"
  path: string
  title: string
  section: string
  start_line: number
  end_line: number
  text: string
  score: number
}

export type CatalogTopic = { topic: string; source_type: string; path: string; section: string }
export type LearnQuestion = { id: string; q: string; type: string }
export type LearnStart = { session_id: string; topic: string; material: Chunk[]; questions: LearnQuestion[] }
export type LearnResult = {
  correct: boolean
  score: number
  feedback: string
  gap_concepts: string[]
  citation: Chunk
  reference_answer?: string | null
}

export type Flag = { code: "low_scores" | "inactive" | "repeat_topic"; label: string }
export type EmployeeRow = {
  id: string
  name: string
  role: string
  manager: string
  manager_type: string
  start_date: string
  days_since_start: number | null
  progress: number
  avg_score: number | null
  recent_avg_score: number | null
  learn_attempts: number
  questions_asked: number
  unanswered: number
  topics_total: number
  topics_started: number
  topics_mastered: number
  last_active: string | null
  days_inactive: number | null
  at_risk: boolean
  flags: Flag[]
  milestones: { first_ticket_assigned: string | null; first_pr_merged: string | null; tickets_done: number; tickets_total: number }
  avg_rating: number | null
  top_gaps: { concept: string; count: number }[]
  learning_path: string[]
}

export type Overview = {
  generated_at: string
  team: {
    employees: number
    at_risk: number
    avg_score: number | null
    avg_progress: number | null
    questions_this_week: number
    unanswered_this_week: number
    checks_this_week: number
    first_pr_merged: number
    avg_rating: number | null
  }
  employees: EmployeeRow[]
  heatmap: { topics: string[]; rows: { employee_id: string; name: string; scores: (number | null)[] }[] }
}

export type Ticket = { key: string; title: string; status: "done" | "in_review" | "in_progress" | "todo"; created: string; resolved: string | null }
export type EventRow = { ts: string; employee_id: string; type: string; topic: string | null; path: string | null; score: number | null; details: Record<string, any> }

export type EmployeeDetail = Omit<EmployeeRow, never> & {
  topics: { topic: string; avg_score: number | null }[]
  tickets: Ticket[]
  unanswered_questions: { ts: string; topic: string | null; question: string | null }[]
  feedback: { ts: string; rating?: number; understood?: string[]; confusing?: string[]; comment?: string }[]
  recent_activity: EventRow[]
}

export type DocGap = {
  path: string
  section: string | null
  topic: string | null
  source_type: string
  impact: number
  severity: "high" | "medium" | "low"
  attempts: number
  wrong_answers: number
  wrong_rate: number
  avg_score: number | null
  unanswered: number
  confused_mentions: number
  affected_employees: number
  gap_concepts: string[]
  sample_questions: string[]
  comments: string[]
  suggestion: string
}

export type Report = { generated_at: string; source: "llm" | "fallback"; markdown: string }

export const p2api = {
  learnTopics: () => request<{ topics: CatalogTopic[]; files: string[] }>("/learn/topics"),
  learnStart: (body: { employee_id: string; topic?: string; path?: string }) => post<LearnStart>("/learn/start", body),
  learnAnswer: (body: { session_id: string; question_id: string; answer: string }) => post<LearnResult>("/learn/answer", body),
  sendExperience: (body: { employee_id: string; rating: number; understood: string[]; confusing: string[]; comment: string }) =>
    post<{ ok: boolean }>("/feedback/experience", body),
  experienceHistory: (employeeId: string) => request<EventRow[]>(`/feedback/experience?employee_id=${encodeURIComponent(employeeId)}`),
  overview: () => request<Overview>("/analytics/overview"),
  employee: (id: string) => request<EmployeeDetail>(`/analytics/employee/${encodeURIComponent(id)}`),
  docGaps: () => request<DocGap[]>("/analytics/doc-gaps"),
  report: () => request<Report>("/analytics/report"),
}

export const pct = (x: number | null | undefined) => (x == null ? "–" : `${Math.round(x * 100)}%`)

export function daysAgo(iso: string | null | undefined) {
  if (!iso) return "never"
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`
}

/** Diverging fill around the 0.6 pass mark: red (0) → neutral gray (0.6) → blue (1). */
export function scoreFill(score: number | null | undefined) {
  if (score == null) return "transparent"
  const PASS = 0.6
  if (score < PASS) {
    const t = Math.round(((PASS - score) / PASS) * 100)
    return `color-mix(in oklab, #e34948 ${t}%, #f0efec)`
  }
  const t = Math.round(((score - PASS) / (1 - PASS)) * 100)
  return `color-mix(in oklab, #2a78d6 ${t}%, #f0efec)`
}

/** Text ink that stays legible on top of scoreFill. */
export function scoreInk(score: number | null | undefined) {
  if (score == null) return "inherit"
  return score < 0.25 || score > 0.9 ? "#ffffff" : "#0b0b0b"
}
