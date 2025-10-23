// Database types and interfaces

export type UserRole = "student" | "faculty"

export interface User {
  id: string
  email: string
  password: string // In production, this would be hashed
  name: string
  role: UserRole
  nuid?: string // Student ID number
  degree?: string // Degree program
  major?: string // Major field of study
  createdAt: Date
}

export interface Class {
  id: string
  name: string
  description: string
  facultyId: string
  studentIds: string[]
  vectorStoreFolder?: string
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
  classId?: string
  title: string
  createdAt: Date
  updatedAt: Date
  messageCount: number
  status?: 'active' | 'archived'
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

// RAG Conversation Management Types
export interface RAGConversation {
  id: string
  userId: string
  classId?: string // New field for class-specific conversations
  title: string
  createdAt: Date
  updatedAt: Date
  status: 'active' | 'archived'
  currentTopic?: string
  checkpointState: {
    checkpoint_1_passed: boolean
    checkpoint_2_passed: boolean
    checkpoint_3_passed: boolean
    understanding_level: number
    awaiting_student_response: boolean
  }
  messageHistory: Array<{
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
    metadata?: any
  }>
  studentProblemData: {
    numbers: string[]
    problem_type?: string
    chapter?: string
  }
  cachedContext?: any
  lastRetrievalTopic?: string
}
