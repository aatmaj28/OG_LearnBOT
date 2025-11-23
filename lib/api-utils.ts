/**
 * API Utilities
 * Helper functions for API routes to get requesting user context
 */

import { type NextRequest } from "next/server"
import { getSession } from "./auth"

export interface RequestingUser {
  id: string
  role: 'student' | 'faculty'
  email: string
  name: string
}

/**
 * Gets the requesting user from session in the request
 * Returns null if no session or invalid session
 * Works with both GET and POST requests
 */
export async function getRequestingUser(request: NextRequest): Promise<RequestingUser | null> {
  try {
    let sessionId: string | null = null
    
    // For POST requests, try JSON body first
    if (request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}))
        sessionId = body.sessionId || null
      } catch {
        // JSON parsing failed, try other sources
      }
    }
    
    // Try headers and cookies as fallback or for GET requests
    if (!sessionId) {
      sessionId = 
        request.headers.get('x-session-id') ||
        request.cookies.get('sessionId')?.value ||
        null
    }
    
    // Also check URL search params for GET requests
    if (!sessionId && request.method === 'GET') {
      const { searchParams } = new URL(request.url)
      sessionId = searchParams.get('sessionId')
    }

    if (!sessionId || typeof sessionId !== 'string') {
      return null
    }

    const session = getSession(sessionId)
    if (!session) {
      return null
    }

    return {
      id: session.user.id,
      role: session.user.role,
      email: session.user.email,
      name: session.user.name
    }
  } catch (error) {
    console.error('[API Utils] Error getting requesting user:', error)
    return null
  }
}

/**
 * Gets sessionId from request (for POST requests with JSON body)
 */
export async function getSessionIdFromRequest(request: NextRequest): Promise<string | null> {
  try {
    const body = await request.json().catch(() => ({}))
    return body.sessionId || null
  } catch {
    // Try headers/cookies as fallback
    return request.headers.get('x-session-id') || request.cookies.get('sessionId')?.value || null
  }
}

