// Authentication utilities
import { getUserByEmail, type User } from "./db-service"

export interface AuthSession {
  user: User
  expiresAt: Date
}

// Simple session storage (in production, use secure cookies/JWT)
// Using a global variable to persist across hot reloads in development
declare global {
  var __sessions: Map<string, AuthSession> | undefined
}

const sessions = globalThis.__sessions ?? new Map<string, AuthSession>()
globalThis.__sessions = sessions

// Debug function to check session storage
export const debugSessions = () => {
  console.log("[v0] DEBUG: Total sessions:", sessions.size)
  console.log("[v0] DEBUG: Session keys:", Array.from(sessions.keys()))
  sessions.forEach((session, key) => {
    console.log("[v0] DEBUG: Session", key, "->", session.user.email)
  })
}

export const login = async (email: string, password: string): Promise<User | null> => {
  const user = await getUserByEmail(email)
  if (user && user.password === password) {
    return user
  }
  return null
}

export const createSession = (user: User): string => {
  const sessionId = Date.now().toString() + Math.random().toString(36).substring(2)
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + 24) // 24 hour session

  sessions.set(sessionId, { user, expiresAt })
  console.log("[v0] Session created:", sessionId, "for user:", user.email)
  console.log("[v0] Total sessions in storage:", sessions.size)
  console.log("[v0] Global sessions reference:", globalThis.__sessions?.size)
  return sessionId
}

export const getSession = (sessionId: string): AuthSession | null => {
  console.log("[v0] Looking for session:", sessionId)
  console.log("[v0] Available sessions:", Array.from(sessions.keys()))
  console.log("[v0] Global sessions reference:", globalThis.__sessions?.size)
  
  const session = sessions.get(sessionId)
  if (!session) {
    console.log("[v0] Session not found in storage")
    return null
  }

  if (session.expiresAt < new Date()) {
    console.log("[v0] Session expired, deleting")
    sessions.delete(sessionId)
    return null
  }

  console.log("[v0] Session found and valid for user:", session.user.email)
  return session
}

export const deleteSession = (sessionId: string): void => {
  sessions.delete(sessionId)
}
