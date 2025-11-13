// Database types and interfaces

export type UserRole = "student" | "faculty"

// LLM Backend Types
export type ModelBackend = 'claude' | 'remote-a6000' | 'remote-blackwell'

export interface ModelResponseMetadata {
  modelUsed: ModelBackend
  timeTaken: number // in milliseconds
  success: boolean
  error?: string
  modelInfo?: {
    name: string
    type: string
    model: string
  }
}

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
  syllabusVectorStoreFolder?: string
  createdAt: Date
}

export interface ChatMessage {
  id: string
  userId: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  sessionId: string
  metadata?: ModelResponseMetadata // Add metadata for model info and timing
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
  preferredModel?: ModelBackend // User's preferred model selection
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
  chatType?: 'class_material' | 'syllabus' // Type of chat conversation
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
    metadata?: ModelResponseMetadata | any
  }>
  studentProblemData: {
    numbers: string[]
    problem_type?: string
    chapter?: string
  }
  cachedContext?: any
  lastRetrievalTopic?: string
  // Analytics caching fields
  cachedSentiment?: number
  cachedTopics?: Array<{ topic: string; count: number }>
  analyticsLastUpdated?: Date
  conversationSummary?: string // Summary of the conversation for analytics
}

export interface Assignment {
  id: string
  classId: string
  facultyId: string
  name: string
  dueDate: Date
  canvasLink?: string
  pdfFileName: string
  createdAt: Date
}

export interface Resource {
  id: string
  classId: string
  facultyId: string
  fileName: string
  fileSize: number
  uploadedAt: Date
}
