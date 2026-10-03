// LearnBOT API client for the P1 endpoints (see CONTRACTS.md › API).
import { getSession, type SessionUser } from "./session"

// Same-origin in prod (FastAPI serves the static build at /). When running `next dev`, set
// NEXT_PUBLIC_API_BASE to the backend, e.g. http://localhost:8001.

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? ""
export const DEMO_EMPLOYEE_ID = process.env.NEXT_PUBLIC_DEMO_EMPLOYEE_ID ?? "emp_demo"
// Browser only: the backend never calls the voice service (reached through the SSH tunnel).
export const VOICE_URL = process.env.NEXT_PUBLIC_VOICE_URL ?? "http://localhost:8100"

export type Chunk = {
  id: string
  project_id: string
  source_type: "code" | "doc" | "meeting"
  path: string
  title: string
  section: string
  start_line: number
  end_line: number
  text: string
  score: number
}

export type Employee = { id: string; name: string; role: string }

export type ChatResponse = { answer: string; citations: Chunk[]; unanswered: boolean; steps: string[] }

export type Project = {
  id: string
  name: string
  git_url?: string | null
  local_path?: string | null
  branch: string
  members: string[]
  last_sha?: string | null
  last_commit?: { sha: string; message: string; author: string; date: string } | null
  last_synced?: string | null
  file_count?: number
  chunk_count?: number
  status?: string
  error?: string | null
}

export type FileContent = { path: string; text: string }

export type ContextFile = { name: string; size: number; updated: string }
export type TeamProject = Project & { context: ContextFile[] }
export type Team = {
  id: string
  name: string
  description: string
  manager_id: string
  member_ids: string[]
  members: { id: string; name: string; role: string }[]
  project_ids: string[]
  projects: TeamProject[]
}
export type HistoryEntry = ChatResponse & { ts: string; question: string; project_id: string | null }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSession()?.token
  const isForm = typeof FormData !== "undefined" && init?.body instanceof FormData
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
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

const post = <T,>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) })

const qs = (params: Record<string, string | undefined | null>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v)
  const s = p.toString()
  return s ? `?${s}` : ""
}

export const api = {
  login: (body: { email: string; password: string; role: "manager" | "employee" }) =>
    post<{ token: string; user: SessionUser }>("/auth/login", body),
  me: () => request<SessionUser>("/auth/me"),
  teams: () => request<Team[]>("/teams"),
  myTeams: () => request<Team[]>("/my/teams"),
  createTeam: (body: { name: string; description?: string; member_ids?: string[] }) => post<Team>("/teams", body),
  attachProject: (teamId: string, project_id: string) =>
    post<Team>(`/teams/${encodeURIComponent(teamId)}/projects`, { project_id }),
  addContext: (projectId: string, form: FormData) =>
    request<{ saved: string[]; context: ContextFile[]; chunks: number }>(
      `/projects/${encodeURIComponent(projectId)}/context`, { method: "POST", body: form }),
  readContext: (projectId: string, name: string) =>
    request<{ name: string; text: string }>(`/projects/${encodeURIComponent(projectId)}/context/${encodeURIComponent(name)}`),
  history: (employeeId: string) => request<HistoryEntry[]>(`/chat/history${qs({ employee_id: employeeId })}`),
  health: () => request<{ ok: boolean; model: string }>("/health"),
  employees: () => request<Employee[]>("/employees"),
  chat: (body: { message: string; employee_id: string; project_id?: string | null; think?: boolean }) =>
    post<ChatResponse>("/chat", body),
  files: (projectId?: string | null) => request<string[]>(`/files${qs({ project_id: projectId })}`),
  fileContent: (path: string, projectId?: string | null, employeeId?: string | null) =>
    request<FileContent>(`/files/content${qs({ path, project_id: projectId, employee_id: employeeId })}`),
  projects: () => request<Project[]>("/projects"),
  createProject: (body: { name: string; git_url?: string; local_path?: string; branch: string; token?: string; team_id?: string }) =>
    post<Project>("/projects", body),
  syncProject: (id: string) => post<Project>(`/projects/${encodeURIComponent(id)}/sync`),
  setMembers: (id: string, employee_ids: string[]) =>
    post<Project>(`/projects/${encodeURIComponent(id)}/members`, { employee_ids }),
  reindex: () => post<{ ok: boolean; projects: number; chunks: number }>("/admin/reindex"),
}
