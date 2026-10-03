// Signed-in user for the new portals (token from POST /api/auth/login), kept in localStorage.
export type SessionUser = {
  id: string
  role: "manager" | "employee"
  name: string
  email: string
  employee_id?: string
  title?: string
}

const KEY = "learnbot.session"

export function getSession(): { token: string; user: SessionUser } | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setSession(token: string, user: SessionUser) {
  localStorage.setItem(KEY, JSON.stringify({ token, user }))
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY)
  } catch {}
}

export const portalHome = (role: SessionUser["role"]) => (role === "manager" ? "/manager" : "/employee/chat")
