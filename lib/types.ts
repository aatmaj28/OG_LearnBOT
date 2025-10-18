// Database types and interfaces

export type UserRole = "student" | "faculty"

export interface User {
  id: string
  email: string
  password: string // In production, this would be hashed
  name: string
  role: UserRole
  createdAt: Date
}

export interface Class {
  id: string
  name: string
  description: string
  facultyId: string
  studentIds: string[]
  createdAt: Date
}

export interface ChatMessage {
  id: string
  userId: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  sessionId: string
}

export interface ChatSession {
  id: string
  userId: string
  title: string
  createdAt: Date
  updatedAt: Date
  messageCount: number
}

export interface ChatAnalytics {
  userId: string
  sessionId: string
  sentiment: "positive" | "neutral" | "negative"
  topics: string[]
  duration: number // in minutes
  messageCount: number
  timestamp: Date
}

export interface StudentActivity {
  userId: string
  totalChatTime: number // in minutes
  totalSessions: number
  averageSentiment: number // -1 to 1
  topTopics: { topic: string; count: number }[]
  lastActive: Date
}
