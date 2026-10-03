// LearnBOT API client for the P1 endpoints (see CONTRACTS.md › API).
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

const post = <T,>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) })

const qs = (params: Record<string, string | undefined | null>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v)
  const s = p.toString()
  return s ? `?${s}` : ""
}

export const api = {
  health: () => request<{ ok: boolean; model: string }>("/health"),
  employees: () => request<Employee[]>("/employees"),
  chat: (body: { message: string; employee_id: string; project_id?: string | null; think?: boolean }) =>
    post<ChatResponse>("/chat", body),
  files: (projectId?: string | null) => request<string[]>(`/files${qs({ project_id: projectId })}`),
  fileContent: (path: string, projectId?: string | null, employeeId?: string | null) =>
    request<FileContent>(`/files/content${qs({ path, project_id: projectId, employee_id: employeeId })}`),
  projects: () => request<Project[]>("/projects"),
  createProject: (body: { name: string; git_url?: string; local_path?: string; branch: string; token?: string }) =>
    post<Project>("/projects", body),
  syncProject: (id: string) => post<Project>(`/projects/${encodeURIComponent(id)}/sync`),
  setMembers: (id: string, employee_ids: string[]) =>
    post<Project>(`/projects/${encodeURIComponent(id)}/members`, { employee_ids }),
  reindex: () => post<{ ok: boolean; projects: number; chunks: number }>("/admin/reindex"),
}
