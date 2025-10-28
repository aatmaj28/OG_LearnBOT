// Mock database for development - replace with real database later
import type { User, Class, ChatMessage, ChatSession, ChatAnalytics, StudentActivity, RAGConversation } from "./types"

// In-memory storage (will reset on page refresh)
const users: User[] = [
  {
    id: "1",
    email: "student@example.com",
    password: "student123",
    name: "John Student",
    role: "student",
    nuid: "12345678",
    degree: "Bachelor of Science",
    major: "Computer Science",
    createdAt: new Date("2024-01-01"),
  },
  {
    id: "2",
    email: "faculty@example.com",
    password: "faculty123",
    name: "Dr. Sarah Professor",
    role: "faculty",
    createdAt: new Date("2024-01-01"),
  },
]

const classes: Class[] = [
  {
    id: "1",
    name: "Introduction to Computer Science",
    description: "Learn the fundamentals of programming and computer science",
    facultyId: "2",
    studentIds: ["1"],
    createdAt: new Date("2024-01-15"),
  },
]

const chatSessions: ChatSession[] = []
const chatMessages: ChatMessage[] = []
const chatAnalytics: ChatAnalytics[] = []
const ragConversations: RAGConversation[] = []

// User operations
export const getUsers = () => users
export const getUserById = (id: string) => users.find((u) => u.id === id)
export const getUserByEmail = (email: string) => users.find((u) => u.email === email)
export const createUser = (user: Omit<User, "id" | "createdAt">) => {
  const newUser: User = {
    ...user,
    id: Date.now().toString(),
    createdAt: new Date(),
  }
  users.push(newUser)
  return newUser
}

// Class operations
export const getClasses = () => classes
export const getClassById = (id: string) => classes.find((c) => c.id === id)
export const getClassesByFaculty = (facultyId: string) => classes.filter((c) => c.facultyId === facultyId)
export const getClassesByStudent = (studentId: string) => classes.filter((c) => c.studentIds.includes(studentId))
export const createClass = (classData: Omit<Class, "id" | "createdAt">) => {
  const newClass: Class = {
    ...classData,
    id: Date.now().toString(),
    createdAt: new Date(),
  }
  classes.push(newClass)
  return newClass
}
export const addStudentToClass = (classId: string, studentId: string) => {
  const classItem = classes.find((c) => c.id === classId)
  if (classItem && !classItem.studentIds.includes(studentId)) {
    classItem.studentIds.push(studentId)
  }
  return classItem
}

// Chat session operations
export const getChatSessions = () => chatSessions
export const getChatSessionsByUser = (userId: string) =>
  chatSessions.filter((s) => s.userId === userId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
export const getChatSessionById = (id: string) => chatSessions.find((s) => s.id === id)
export const createChatSession = (userId: string, title = "New Chat") => {
  const newSession: ChatSession = {
    id: Date.now().toString(),
    userId,
    title,
    createdAt: new Date(),
    updatedAt: new Date(),
    messageCount: 0,
  }
  chatSessions.push(newSession)
  return newSession
}
export const updateChatSession = (id: string, updates: Partial<ChatSession>) => {
  const session = chatSessions.find((s) => s.id === id)
  if (session) {
    Object.assign(session, updates, { updatedAt: new Date() })
  }
  return session
}

// Chat message operations
export const getChatMessages = () => chatMessages
export const getChatMessagesBySession = (sessionId: string) =>
  chatMessages.filter((m) => m.sessionId === sessionId).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
export const getChatMessagesByUser = (userId: string) => chatMessages.filter((m) => m.userId === userId)
export const createChatMessage = (message: Omit<ChatMessage, "id" | "timestamp">) => {
  const newMessage: ChatMessage = {
    ...message,
    id: Date.now().toString(),
    timestamp: new Date(),
  }
  chatMessages.push(newMessage)

  // Update session message count
  const session = chatSessions.find((s) => s.id === message.sessionId)
  if (session) {
    session.messageCount++
    session.updatedAt = new Date()
  }

  return newMessage
}

// Analytics operations
export const getChatAnalytics = () => chatAnalytics
export const getChatAnalyticsByUser = (userId: string) => chatAnalytics.filter((a) => a.userId === userId)
export const createChatAnalytics = (analytics: Omit<ChatAnalytics, "timestamp">) => {
  const newAnalytics: ChatAnalytics = {
    ...analytics,
    timestamp: new Date(),
  }
  chatAnalytics.push(newAnalytics)
  return newAnalytics
}

// Student activity aggregation
export const getStudentActivity = (userId: string): StudentActivity => {
  const userAnalytics = getChatAnalyticsByUser(userId)
  const userSessions = getChatSessionsByUser(userId)

  const totalChatTime = userAnalytics.reduce((sum, a) => sum + a.duration, 0)
  const totalSessions = userSessions.length

  const sentimentMap = { positive: 1, neutral: 0, negative: -1 }
  const averageSentiment =
    userAnalytics.length > 0
      ? userAnalytics.reduce((sum, a) => sum + sentimentMap[a.sentiment], 0) / userAnalytics.length
      : 0

  const topicCounts = new Map<string, number>()
  userAnalytics.forEach((a) => {
    a.topics.forEach((topic) => {
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1)
    })
  })

  const topTopics = Array.from(topicCounts.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const lastActive =
    userSessions.length > 0 ? new Date(Math.max(...userSessions.map((s) => s.updatedAt.getTime()))) : new Date()

  return {
    userId,
    totalChatTime,
    totalSessions,
    averageSentiment,
    topTopics,
    lastActive,
  }
}

export const getStudentActivitiesByClass = (classId: string): StudentActivity[] => {
  const classItem = getClassById(classId)
  if (!classItem) return []

  return classItem.studentIds.map((studentId) => getStudentActivity(studentId))
}

export const getStudentsByClass = (classId: string): User[] => {
  const classItem = getClassById(classId)
  if (!classItem) return []

  return classItem.studentIds
    .map((studentId) => getUserById(studentId))
    .filter((student): student is User => student !== undefined)
}

// RAG Conversation operations
export const getRAGConversations = () => ragConversations
export const getRAGConversationsByUser = (userId: string) =>
  ragConversations.filter((c) => c.userId === userId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
export const getRAGConversationById = (id: string) => ragConversations.find((c) => c.id === id)
export const createRAGConversation = (userId: string, title = "New Conversation") => {
  const newConversation: RAGConversation = {
    id: Date.now().toString(),
    userId,
    title,
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'active',
    checkpointState: {
      checkpoint_1_passed: false,
      checkpoint_2_passed: false,
      checkpoint_3_passed: false,
      understanding_level: 0,
      awaiting_student_response: true
    },
    messageHistory: [],
    studentProblemData: {
      numbers: [],
      problem_type: undefined,
      chapter: undefined
    }
  }
  ragConversations.push(newConversation)
  return newConversation
}
export const updateRAGConversation = (id: string, updates: Partial<RAGConversation>) => {
  const conversation = ragConversations.find((c) => c.id === id)
  if (conversation) {
    Object.assign(conversation, updates, { updatedAt: new Date() })
  }
  return conversation
}
export const archiveRAGConversation = (id: string) => {
  updateRAGConversation(id, { status: 'archived' })
}
export const addRAGMessage = (conversationId: string, role: 'user' | 'assistant', content: string, metadata?: any) => {
  const conversation = ragConversations.find((c) => c.id === conversationId)
  if (conversation) {
    conversation.messageHistory.push({
      role,
      content,
      timestamp: new Date(),
      metadata
    })
    conversation.updatedAt = new Date()
  }
}

// Generate some mock analytics data for the demo student
if (users.length > 0 && chatSessions.length === 0) {
  // Create a few mock sessions for the student
  const studentId = "1"

  // Session 1: Math help
  const session1 = createChatSession(studentId, "Help with algebra equations")
  createChatMessage({
    userId: studentId,
    sessionId: session1.id,
    role: "user",
    content: "Can you help me solve quadratic equations?",
  })
  createChatMessage({
    userId: studentId,
    sessionId: session1.id,
    role: "assistant",
    content:
      "Of course! A quadratic equation is in the form ax² + bx + c = 0. You can solve it using the quadratic formula: x = (-b ± √(b² - 4ac)) / 2a. Would you like to work through an example?",
  })
  createChatMessage({
    userId: studentId,
    sessionId: session1.id,
    role: "user",
    content: "Yes please! Can we solve x² + 5x + 6 = 0?",
  })
  createChatMessage({
    userId: studentId,
    sessionId: session1.id,
    role: "assistant",
    content:
      "Great example! Here a=1, b=5, c=6. Using the formula: x = (-5 ± √(25-24)) / 2 = (-5 ± 1) / 2. So x = -2 or x = -3. You can verify by factoring: (x+2)(x+3) = 0.",
  })

  createChatAnalytics({
    userId: studentId,
    sessionId: session1.id,
    sentiment: "positive",
    topics: ["Mathematics", "Algebra"],
    duration: 15,
    messageCount: 4,
  })

  // Session 2: Programming help
  const session2 = createChatSession(studentId, "Learning about functions in programming")
  createChatMessage({
    userId: studentId,
    sessionId: session2.id,
    role: "user",
    content: "What are functions in programming?",
  })
  createChatMessage({
    userId: studentId,
    sessionId: session2.id,
    role: "assistant",
    content:
      "Functions are reusable blocks of code that perform specific tasks. They help organize your code and avoid repetition. A function typically has a name, parameters (inputs), and returns a value (output).",
  })

  createChatAnalytics({
    userId: studentId,
    sessionId: session2.id,
    sentiment: "neutral",
    topics: ["Programming"],
    duration: 8,
    messageCount: 2,
  })

  // Session 3: Science question
  const session3 = createChatSession(studentId, "Understanding photosynthesis")
  createChatMessage({
    userId: studentId,
    sessionId: session3.id,
    role: "user",
    content: "Can you explain photosynthesis?",
  })
  createChatMessage({
    userId: studentId,
    sessionId: session3.id,
    role: "assistant",
    content:
      "Photosynthesis is the process plants use to convert light energy into chemical energy. Plants take in carbon dioxide and water, and using sunlight, produce glucose (sugar) and oxygen. The equation is: 6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂",
  })

  createChatAnalytics({
    userId: studentId,
    sessionId: session3.id,
    sentiment: "positive",
    topics: ["Science", "Biology"],
    duration: 10,
    messageCount: 2,
  })
}
