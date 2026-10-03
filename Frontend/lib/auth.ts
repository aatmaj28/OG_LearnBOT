// Authentication utilities
// Note: Using internal getUserByEmailInternal for authentication
// Authentication needs real email, not masked data
import { getUserByEmailInternal } from "./db-service"
import type { User } from "./types"
import { getUserByEmail as getMockUserByEmail } from "./mock-db"
import { enableDatabaseFallback, isDatabaseFallbackEnabled } from "./init-db"
import { verifyPassword } from "./password"

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

const recoverableDbErrors = new Set(['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'])

const shouldFallbackToMock = (error: any): boolean => {
  if (!error) return false
  const code = error.code || error.errno
  return recoverableDbErrors.has(code)
}

export const login = async (email: string, password: string): Promise<User | null> => {
  if (!isDatabaseFallbackEnabled()) {
    try {
      const user = await getUserByEmailInternal(email, undefined)
      if (user && (await verifyPassword(password, user.password))) {
        return user
      }
    } catch (error) {
      if (shouldFallbackToMock(error)) {
        enableDatabaseFallback('Authentication query failed', error)
      } else {
        throw error
      }
    }
  }

  // Fallback to mock data for offline development
  const mockUser = getMockUserByEmail(email)
  if (mockUser && (await verifyPassword(password, mockUser.password))) {
    return mockUser
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
