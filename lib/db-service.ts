import pool from './db'
import type { User, Class, ChatMessage, ChatSession, ChatAnalytics, StudentActivity, RAGConversation, Assignment, Resource } from './types'

// User operations
export const getUsers = async (): Promise<User[]> => {
  const client = await pool.connect()
  try {
    const result = await client.query('SELECT * FROM users ORDER BY created_at DESC')
    return result.rows.map(row => ({
      id: row.id.toString(),
      email: row.email,
      password: row.password,
      name: row.name,
      role: row.role as 'student' | 'faculty',
      nuid: row.nuid,
      degree: row.degree,
      major: row.major,
      createdAt: new Date(row.created_at)
    }))
  } finally {
    client.release()
  }
}

export const getUserById = async (id: string): Promise<User | null> => {
  const client = await pool.connect()
  try {
    const result = await client.query('SELECT * FROM users WHERE id = $1', [id])
    if (result.rows.length === 0) return null
    
    const row = result.rows[0]
    return {
      id: row.id.toString(),
      email: row.email,
      password: row.password,
      name: row.name,
      role: row.role as 'student' | 'faculty',
      nuid: row.nuid,
      degree: row.degree,
      major: row.major,
      createdAt: new Date(row.created_at)
    }
  } finally {
    client.release()
  }
}

export const getUserByEmail = async (email: string): Promise<User | null> => {
  const client = await pool.connect()
  try {
    const result = await client.query('SELECT * FROM users WHERE email = $1', [email])
    if (result.rows.length === 0) return null
    
    const row = result.rows[0]
    return {
      id: row.id.toString(),
      email: row.email,
      password: row.password,
      name: row.name,
      role: row.role as 'student' | 'faculty',
      nuid: row.nuid,
      degree: row.degree,
      major: row.major,
      createdAt: new Date(row.created_at)
    }
  } finally {
    client.release()
  }
}

export const getUserByNuid = async (nuid: string): Promise<User | null> => {
  const client = await pool.connect()
  try {
    const result = await client.query('SELECT * FROM users WHERE nuid = $1', [nuid])
    if (result.rows.length === 0) return null
    
    const row = result.rows[0]
    return {
      id: row.id.toString(),
      email: row.email,
      password: row.password,
      name: row.name,
      role: row.role as 'student' | 'faculty',
      nuid: row.nuid,
      degree: row.degree,
      major: row.major,
      createdAt: new Date(row.created_at)
    }
  } finally {
    client.release()
  }
}

export const createUser = async (user: Omit<User, 'id' | 'createdAt'>): Promise<User> => {
  const client = await pool.connect()
  try {
    const result = await client.query(
      `INSERT INTO users (email, password, name, role, nuid, degree, major) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING id, created_at`,
      [user.email, user.password, user.name, user.role, user.nuid, user.degree, user.major]
    )
    
    const row = result.rows[0]
    return {
      ...user,
      id: row.id.toString(),
      createdAt: new Date(row.created_at)
    }
  } finally {
    client.release()
  }
}

// Class operations
export const getClasses = async (): Promise<Class[]> => {
  const client = await pool.connect()
  try {
    const result = await client.query(`
      SELECT c.*, 
             COALESCE(
               ARRAY_AGG(cs.student_id) FILTER (WHERE cs.student_id IS NOT NULL), 
               ARRAY[]::INTEGER[]
             ) as student_ids
      FROM classes c
      LEFT JOIN class_students cs ON c.id = cs.class_id
      GROUP BY c.id, c.name, c.description, c.faculty_id, c.vector_store_folder, c.syllabus_vector_store_folder, c.created_at
      ORDER BY c.created_at DESC
    `)
    
    return result.rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      description: row.description,
      facultyId: row.faculty_id.toString(),
      studentIds: row.student_ids.map((id: number) => id.toString()),
      vectorStoreFolder: row.vector_store_folder || null,
      syllabusVectorStoreFolder: row.syllabus_vector_store_folder || null,
      createdAt: new Date(row.created_at)
    }))
  } finally {
    client.release()
  }
}

export const getClassById = async (id: string): Promise<Class | null> => {
  const client = await pool.connect()
  try {
    const result = await client.query(`
      SELECT c.*, 
             COALESCE(
               ARRAY_AGG(cs.student_id) FILTER (WHERE cs.student_id IS NOT NULL), 
               ARRAY[]::INTEGER[]
             ) as student_ids
      FROM classes c
      LEFT JOIN class_students cs ON c.id = cs.class_id
      WHERE c.id = $1
      GROUP BY c.id, c.name, c.description, c.faculty_id, c.vector_store_folder, c.syllabus_vector_store_folder, c.created_at
    `, [id])
    
    if (result.rows.length === 0) return null
    
    const row = result.rows[0]
    return {
      id: row.id.toString(),
      name: row.name,
      description: row.description,
      facultyId: row.faculty_id.toString(),
      vectorStoreFolder: row.vector_store_folder,
      syllabusVectorStoreFolder: row.syllabus_vector_store_folder,
      studentIds: row.student_ids.map((id: number) => id.toString()),
      createdAt: new Date(row.created_at)
    }
  } finally {
    client.release()
  }
}

export const getClassesByFaculty = async (facultyId: string): Promise<Class[]> => {
  const client = await pool.connect()
  try {
    const result = await client.query(`
      SELECT c.*, 
             COALESCE(
               ARRAY_AGG(cs.student_id) FILTER (WHERE cs.student_id IS NOT NULL), 
               ARRAY[]::INTEGER[]
             ) as student_ids
      FROM classes c
      LEFT JOIN class_students cs ON c.id = cs.class_id
      WHERE c.faculty_id = $1
      GROUP BY c.id, c.name, c.description, c.faculty_id, c.vector_store_folder, c.syllabus_vector_store_folder, c.created_at
      ORDER BY c.created_at DESC
    `, [facultyId])
    
    return result.rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      description: row.description,
      facultyId: row.faculty_id.toString(),
      vectorStoreFolder: row.vector_store_folder || null,
      syllabusVectorStoreFolder: row.syllabus_vector_store_folder || null,
      studentIds: row.student_ids.map((id: number) => id.toString()),
      createdAt: new Date(row.created_at)
    }))
  } finally {
    client.release()
  }
}

export const getClassesByStudent = async (studentId: string): Promise<Class[]> => {
  const client = await pool.connect()
  try {
    const result = await client.query(`
      SELECT c.*, 
             COALESCE(
               ARRAY_AGG(cs.student_id) FILTER (WHERE cs.student_id IS NOT NULL), 
               ARRAY[]::INTEGER[]
             ) as student_ids
      FROM classes c
      LEFT JOIN class_students cs ON c.id = cs.class_id
      WHERE cs.student_id = $1
      GROUP BY c.id, c.name, c.description, c.faculty_id, c.vector_store_folder, c.syllabus_vector_store_folder, c.created_at
      ORDER BY c.created_at DESC
    `, [studentId])
    
    return result.rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      description: row.description,
      facultyId: row.faculty_id.toString(),
      vectorStoreFolder: row.vector_store_folder || null,
      syllabusVectorStoreFolder: row.syllabus_vector_store_folder || null,
      studentIds: row.student_ids.map((id: number) => id.toString()),
      createdAt: new Date(row.created_at)
    }))
  } finally {
    client.release()
  }
}

export const createClass = async (classData: Omit<Class, 'id' | 'createdAt'>): Promise<Class> => {
  const client = await pool.connect()
  try {
    // Check if a class with the same name already exists for this faculty
    const existingClass = await client.query(
      `SELECT id, name FROM classes WHERE name = $1 AND faculty_id = $2`,
      [classData.name, classData.facultyId]
    )
    
    if (existingClass.rows.length > 0) {
      throw new Error(`A class with the name "${classData.name}" already exists. Please use a different name.`)
    }
    
    // Generate vector store folder name from class name
    const vectorStoreFolder = generateVectorStoreFolderName(classData.name)
    
    // Try to insert with vector_store_folder column first
    try {
      const result = await client.query(
        `INSERT INTO classes (name, description, faculty_id, vector_store_folder) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id, created_at`,
        [classData.name, classData.description, classData.facultyId, vectorStoreFolder]
      )
      
      const row = result.rows[0]
      return {
        ...classData,
        id: row.id.toString(),
        vectorStoreFolder,
        createdAt: new Date(row.created_at)
      }
    } catch (error: any) {
      // If vector_store_folder column doesn't exist, fall back to old schema
      if (error.code === '42703') { // Column doesn't exist
        console.warn('vector_store_folder column not found, using fallback schema')
        
        const result = await client.query(
          `INSERT INTO classes (name, description, faculty_id) 
           VALUES ($1, $2, $3) 
           RETURNING id, created_at`,
          [classData.name, classData.description, classData.facultyId]
        )
        
        const row = result.rows[0]
        return {
          ...classData,
          id: row.id.toString(),
          vectorStoreFolder: vectorStoreFolder, // Still generate for future use
          createdAt: new Date(row.created_at)
        }
      } else {
        throw error
      }
    }
  } finally {
    client.release()
  }
}

// Helper function to generate vector store folder name from class name
const generateVectorStoreFolderName = (className: string): string => {
  // Convert class name to lowercase, replace spaces and special characters with underscores
  // Example: "FINA 2201" -> "fina_2201", "CS 101" -> "cs_101"
  return className
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters except spaces
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .trim()
}

// Export the function so it can be used elsewhere
export { generateVectorStoreFolderName }

// Update class vector store folder
export const updateClassVectorStoreFolder = async (classId: string, vectorStoreFolder: string): Promise<Class | null> => {
  const client = await pool.connect()
  try {
    await client.query(
      'UPDATE classes SET vector_store_folder = $1 WHERE id = $2',
      [vectorStoreFolder, classId]
    )
    return await getClassById(classId)
  } finally {
    client.release()
  }
}

// Update class syllabus vector store folder
export const updateClassSyllabusVectorStoreFolder = async (classId: string, syllabusVectorStoreFolder: string): Promise<Class | null> => {
  const client = await pool.connect()
  try {
    await client.query(
      'UPDATE classes SET syllabus_vector_store_folder = $1 WHERE id = $2',
      [syllabusVectorStoreFolder, classId]
    )
    return await getClassById(classId)
  } finally {
    client.release()
  }
}

export const addStudentToClass = async (classId: string, studentId: string): Promise<Class | null> => {
  const client = await pool.connect()
  try {
    await client.query(
      'INSERT INTO class_students (class_id, student_id) VALUES ($1, $2) ON CONFLICT (class_id, student_id) DO NOTHING',
      [classId, studentId]
    )
    
    return await getClassById(classId)
  } finally {
    client.release()
  }
}

export const removeStudentFromClass = async (classId: string, studentId: string): Promise<Class | null> => {
  const client = await pool.connect()
  try {
    await client.query(
      'DELETE FROM class_students WHERE class_id = $1 AND student_id = $2',
      [classId, studentId]
    )
    
    return await getClassById(classId)
  } finally {
    client.release()
  }
}

export const deleteClass = async (classId: string): Promise<boolean> => {
  const client = await pool.connect()
  try {
    // First check if class exists and get its vector store folder
    const classExists = await getClassById(classId)
    if (!classExists) {
      return false
    }

    // Delete the class (cascade will handle related records)
    const result = await client.query('DELETE FROM classes WHERE id = $1', [classId])
    
    if ((result.rowCount ?? 0) > 0) {
      // Clean up both class material and syllabus vector store folders if they exist
      try {
        const fs = require('fs')
        const path = require('path')
        
        // Delete class material vector store
        if (classExists.vectorStoreFolder) {
          const vectorStorePath = path.join(process.cwd(), 'vector_stores', classExists.vectorStoreFolder)
          if (fs.existsSync(vectorStorePath)) {
            // Unload from memory before deleting
            try {
              const { ragService } = require('./rag-service')
              await ragService.unloadVectorStore(vectorStorePath)
            } catch (error) {
              console.warn('Failed to unload class material vector store from memory:', error)
            }
            fs.rmSync(vectorStorePath, { recursive: true, force: true })
            console.log(`🗑️ Deleted class material vector store folder: ${classExists.vectorStoreFolder}`)
          }
        }
        
        // Delete syllabus vector store
        if (classExists.syllabusVectorStoreFolder) {
          const syllabusVectorStorePath = path.join(process.cwd(), 'vector_stores', classExists.syllabusVectorStoreFolder)
          if (fs.existsSync(syllabusVectorStorePath)) {
            // Unload from memory before deleting
            try {
              const { ragService } = require('./rag-service')
              await ragService.unloadVectorStore(syllabusVectorStorePath)
            } catch (error) {
              console.warn('Failed to unload syllabus vector store from memory:', error)
            }
            fs.rmSync(syllabusVectorStorePath, { recursive: true, force: true })
            console.log(`🗑️ Deleted syllabus vector store folder: ${classExists.syllabusVectorStoreFolder}`)
          }
        }
      } catch (error) {
        console.warn('Failed to delete vector store folder(s):', error)
        // Don't fail the class deletion if folder cleanup fails
      }
    }
    
    return (result.rowCount ?? 0) > 0
  } finally {
    client.release()
  }
}

export const getStudentsByClass = async (classId: string): Promise<User[]> => {
  const client = await pool.connect()
  try {
    const result = await client.query(`
      SELECT u.* FROM users u
      INNER JOIN class_students cs ON u.id = cs.student_id
      WHERE cs.class_id = $1 AND u.role = 'student'
      ORDER BY u.name
    `, [classId])
    
    return result.rows.map(row => ({
      id: row.id.toString(),
      email: row.email,
      password: row.password,
      name: row.name,
      role: row.role as 'student' | 'faculty',
      nuid: row.nuid,
      degree: row.degree,
      major: row.major,
      createdAt: new Date(row.created_at)
    }))
  } finally {
    client.release()
  }
}

// Chat session operations
export const getChatSessions = async (): Promise<ChatSession[]> => {
  const client = await pool.connect()
  try {
    const result = await client.query('SELECT * FROM chat_sessions ORDER BY updated_at DESC')
    return result.rows.map(row => ({
      id: row.id.toString(),
      userId: row.user_id.toString(),
      classId: row.class_id?.toString(),
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      messageCount: row.message_count
    }))
  } finally {
    client.release()
  }
}

export const getChatSessionsByUser = async (userId: string): Promise<ChatSession[]> => {
  const client = await pool.connect()
  try {
    const result = await client.query(
      'SELECT * FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC',
      [userId]
    )
    return result.rows.map(row => ({
      id: row.id.toString(),
      userId: row.user_id.toString(),
      classId: row.class_id?.toString(),
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      messageCount: row.message_count
    }))
  } finally {
    client.release()
  }
}

export const getChatSessionById = async (id: string): Promise<ChatSession | null> => {
  const client = await pool.connect()
  try {
    const result = await client.query('SELECT * FROM chat_sessions WHERE id = $1', [id])
    if (result.rows.length === 0) return null
    
    const row = result.rows[0]
    return {
      id: row.id.toString(),
      userId: row.user_id.toString(),
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      messageCount: row.message_count
    }
  } finally {
    client.release()
  }
}

export const createChatSession = async (userId: string, title = "New Chat"): Promise<ChatSession> => {
  const client = await pool.connect()
  try {
    const result = await client.query(
      'INSERT INTO chat_sessions (user_id, title) VALUES ($1, $2) RETURNING *',
      [userId, title]
    )
    
    const row = result.rows[0]
    return {
      id: row.id.toString(),
      userId: row.user_id.toString(),
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      messageCount: row.message_count
    }
  } finally {
    client.release()
  }
}

export const updateChatSession = async (id: string, updates: Partial<ChatSession>): Promise<ChatSession | null> => {
  const client = await pool.connect()
  try {
    const setClause = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'createdAt')
      .map((key, index) => {
        if (key === 'updatedAt') return `updated_at = $${index + 1}`
        if (key === 'userId') return `user_id = $${index + 1}`
        if (key === 'messageCount') return `message_count = $${index + 1}`
        return `${key} = $${index + 1}`
      })
      .join(', ')

    if (setClause === '') return await getChatSessionById(id)

    const values = Object.values(updates).filter((_, index) => 
      Object.keys(updates)[index] !== 'id' && Object.keys(updates)[index] !== 'createdAt'
    )

    await client.query(
      `UPDATE chat_sessions SET ${setClause} WHERE id = $${values.length + 1}`,
      [...values, id]
    )

    return await getChatSessionById(id)
  } finally {
    client.release()
  }
}

// Chat message operations
export const getChatMessages = async (): Promise<ChatMessage[]> => {
  const client = await pool.connect()
  try {
    const result = await client.query('SELECT * FROM chat_messages ORDER BY timestamp ASC')
    return result.rows.map(row => ({
      id: row.id.toString(),
      userId: row.user_id.toString(),
      role: row.role as 'user' | 'assistant',
      content: row.content,
      timestamp: new Date(row.timestamp),
      sessionId: row.session_id.toString()
    }))
  } finally {
    client.release()
  }
}

export const getChatMessagesBySession = async (sessionId: string): Promise<ChatMessage[]> => {
  const client = await pool.connect()
  try {
    const result = await client.query(
      'SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY timestamp ASC',
      [sessionId]
    )
    return result.rows.map(row => ({
      id: row.id.toString(),
      userId: row.user_id.toString(),
      role: row.role as 'user' | 'assistant',
      content: row.content,
      timestamp: new Date(row.timestamp),
      sessionId: row.session_id.toString()
    }))
  } finally {
    client.release()
  }
}

export const getChatMessagesByUser = async (userId: string): Promise<ChatMessage[]> => {
  const client = await pool.connect()
  try {
    const result = await client.query(
      'SELECT * FROM chat_messages WHERE user_id = $1 ORDER BY timestamp ASC',
      [userId]
    )
    return result.rows.map(row => ({
      id: row.id.toString(),
      userId: row.user_id.toString(),
      role: row.role as 'user' | 'assistant',
      content: row.content,
      timestamp: new Date(row.timestamp),
      sessionId: row.session_id.toString()
    }))
  } finally {
    client.release()
  }
}

export const createChatMessage = async (message: Omit<ChatMessage, 'id' | 'timestamp'>): Promise<ChatMessage> => {
  const client = await pool.connect()
  try {
    const result = await client.query(
      `INSERT INTO chat_messages (user_id, session_id, role, content) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, timestamp`,
      [message.userId, message.sessionId, message.role, message.content]
    )
    
    const row = result.rows[0]
    
    // Update session message count
    await client.query(
      'UPDATE chat_sessions SET message_count = message_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [message.sessionId]
    )
    
    return {
      ...message,
      id: row.id.toString(),
      timestamp: new Date(row.timestamp)
    }
  } finally {
    client.release()
  }
}

// Analytics operations
export const getChatAnalytics = async (): Promise<ChatAnalytics[]> => {
  const client = await pool.connect()
  try {
    const result = await client.query('SELECT * FROM chat_analytics ORDER BY timestamp DESC')
    return result.rows.map(row => ({
      userId: row.user_id.toString(),
      sessionId: row.session_id.toString(),
      sentiment: row.sentiment as 'positive' | 'neutral' | 'negative',
      topics: row.topics || [],
      duration: row.duration,
      messageCount: row.message_count,
      timestamp: new Date(row.timestamp)
    }))
  } finally {
    client.release()
  }
}

export const getChatAnalyticsByUser = async (userId: string): Promise<ChatAnalytics[]> => {
  const client = await pool.connect()
  try {
    const result = await client.query(
      'SELECT * FROM chat_analytics WHERE user_id = $1 ORDER BY timestamp DESC',
      [userId]
    )
    return result.rows.map(row => ({
      userId: row.user_id.toString(),
      sessionId: row.session_id.toString(),
      sentiment: row.sentiment as 'positive' | 'neutral' | 'negative',
      topics: row.topics || [],
      duration: row.duration,
      messageCount: row.message_count,
      timestamp: new Date(row.timestamp)
    }))
  } finally {
    client.release()
  }
}

export const createChatAnalytics = async (analytics: Omit<ChatAnalytics, 'timestamp'>): Promise<ChatAnalytics> => {
  const client = await pool.connect()
  try {
    const result = await client.query(
      `INSERT INTO chat_analytics (user_id, session_id, sentiment, topics, duration, message_count) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING timestamp`,
      [analytics.userId, analytics.sessionId, analytics.sentiment, analytics.topics, analytics.duration, analytics.messageCount]
    )
    
    const row = result.rows[0]
    return {
      ...analytics,
      timestamp: new Date(row.timestamp)
    }
  } finally {
    client.release()
  }
}

// Student activity aggregation - Updated to use RAG conversations
export const getStudentActivity = async (userId: string, classId?: string, skipLLMAnalysis: boolean = false): Promise<StudentActivity> => {
  const client = await pool.connect()
  try {
    // Get all RAG conversations for the user (optionally filtered by class)
    const conversations = await getRAGConversationsByUser(userId, classId)
    
    if (conversations.length === 0) {
      return {
        userId,
        totalChatTime: 0,
        totalSessions: 0,
        averageSentiment: 0,
        topTopics: [],
        lastActive: new Date()
      }
    }

    // Calculate total chat time from message timestamps
    let totalChatTime = 0
    const allMessages: any[] = []
    
    conversations.forEach(conversation => {
      const messages = conversation.messageHistory || []
      allMessages.push(...messages)
      
      if (messages.length >= 2) {
        // Calculate time from first user message to last assistant message
        const userMessages = messages.filter(m => m.role === 'user')
        const assistantMessages = messages.filter(m => m.role === 'assistant')
        
        if (userMessages.length > 0 && assistantMessages.length > 0) {
          const firstUserTime = new Date(userMessages[0].timestamp).getTime()
          const lastAssistantTime = new Date(assistantMessages[assistantMessages.length - 1].timestamp).getTime()
          const sessionTime = (lastAssistantTime - firstUserTime) / (1000 * 60) // Convert to minutes
          totalChatTime += Math.max(0, sessionTime) // Ensure non-negative
        }
      }
    })

    const totalSessions = conversations.length
    const lastActive = conversations.length > 0 
      ? new Date(Math.max(...conversations.map(c => new Date(c.updatedAt).getTime())))
      : new Date()

    // Use only the latest conversation for analysis (most recent)
    const latestConversation = conversations.length > 0 ? conversations[0] : null
    let averageSentiment = 0
    let topTopics: { topic: string; count: number }[] = []

    if (latestConversation && latestConversation.messageHistory && latestConversation.messageHistory.length > 0) {
      // PRIORITY 1: Use cached analytics if available (instant!)
      if (latestConversation.cachedSentiment !== undefined && latestConversation.cachedTopics) {
        console.log(`[v0] Using cached analytics for user ${userId}`)
        averageSentiment = latestConversation.cachedSentiment
        topTopics = latestConversation.cachedTopics
      } 
      // PRIORITY 2: Use fast keyword-based fallback for batch operations
      else if (skipLLMAnalysis) {
        console.log(`[v0] No cache available, using fast fallback for user ${userId}`)
        const latestMessages = latestConversation.messageHistory
        averageSentiment = calculateSimpleSentiment(latestMessages.filter((m: any) => m.role === 'user'))
        topTopics = extractSimpleTopics(latestMessages)
      } 
      // PRIORITY 3: Run LLM analysis only when specifically requested AND no cache
      else {
        console.log(`[v0] Running LLM analysis for user ${userId} (no cache, not skipped)`)
        const latestMessages = latestConversation.messageHistory
        const analysisResult = await analyzeLatestConversation(userId, classId, latestMessages, latestConversation.title)
        averageSentiment = analysisResult.sentiment
        topTopics = analysisResult.topics
        
        console.log(`[v0] Latest conversation analysis for user ${userId}:`, {
          sentiment: averageSentiment,
          topics: topTopics,
          conversationTitle: latestConversation.title
        })
      }
    } else {
      console.log(`[v0] No messages found in latest conversation for user ${userId}`)
    }

    return {
      userId,
      totalChatTime: Math.round(totalChatTime),
      totalSessions,
      averageSentiment,
      topTopics,
      lastActive,
    }
  } finally {
    client.release()
  }
}

// Helper function to generate conversation summary using LLM
export const generateConversationSummary = async (messages: any[], existingSummary?: string): Promise<string> => {
  if (messages.length === 0) {
    return existingSummary || ''
  }

  // Check if LLM analytics is enabled (default: true for backward compatibility)
  const enableLLMAnalytics = process.env.ENABLE_LLM_ANALYTICS !== 'false'
  
  // If LLM analytics is disabled, skip directly to enhanced keyword-based fallback
  if (!enableLLMAnalytics) {
    return generateEnhancedSummary(messages, existingSummary)
  }

  try {
    // If we have an existing summary and new messages, do incremental update
    const recentMessages = existingSummary 
      ? messages.slice(-5) // Only last 5 messages for incremental update
      : messages // All messages for initial summary

    const conversationText = recentMessages.map((msg, index) => 
      `${msg.role === 'user' ? 'Student' : 'Assistant'}: ${msg.content}`
    ).join('\n\n')

    const prompt = existingSummary
      ? `You have an existing summary of a student-teacher conversation. Here are the new messages that were just added. Update the summary to include these new messages while keeping it concise (2-3 sentences).

Existing Summary:
${existingSummary}

New Messages:
${conversationText}

Provide an updated summary that incorporates the new information:`
      : `Summarize this student-teacher conversation in 2-3 sentences. Focus on:
1. The main topic/question the student asked
2. Key concepts discussed
3. The learning outcome or resolution

Conversation:
${conversationText}

Summary:`

    // Use Remote Blackwell (vLLM) first, fallback to Remote A6000 Ollama
    const blackwellUrl = process.env.REMOTE_BLACKWELL_URL || 'http://localhost:8001/v1/chat/completions'
    const blackwellModel = process.env.REMOTE_BLACKWELL_MODEL || 'google/gemma-3-12b-it'
    const a6000Url = process.env.REMOTE_OLLAMA_URL || 'http://localhost:5001/api/generate'
    const a6000Model = process.env.REMOTE_OLLAMA_MODEL || 'gemma3:27b'
    
    let response: Response | null = null
    let responseData: any = null
    
    // Try Blackwell first
    try {
      response = await fetch(blackwellUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: blackwellModel,
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 150 // Limit summary length
        }),
        signal: AbortSignal.timeout(30000) // 30s timeout
      })
      
      if (response.ok) {
        responseData = await response.json()
        const summary = responseData.choices?.[0]?.message?.content?.trim() || ''
        if (summary) {
          return summary.split('\n')[0].trim() // Take first line only
        }
      }
    } catch (blackwellError) {
      // Blackwell failed, try A6000 as fallback
    }
    
    // Fallback to A6000 Ollama
    try {
      response = await fetch(a6000Url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: a6000Model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.3,
            top_p: 0.9,
            num_predict: 150 // Limit summary length
          }
        }),
        signal: AbortSignal.timeout(30000) // 30s timeout
      })
      
      if (response.ok) {
        responseData = await response.json()
        const summary = responseData.response?.trim() || ''
        if (summary) {
          return summary.split('\n')[0].trim() // Take first line only
        }
      }
    } catch (a6000Error) {
      // Both failed, will use fallback summary below
      throw new Error('Both Blackwell and A6000 unavailable')
    }
  } catch (error) {
    // Silently fail - will use fallback summary below
    // Only log if it's not a connection error (which is expected when models aren't available)
    if (error instanceof Error && !error.message.includes('unavailable') && !error.message.includes('ECONNREFUSED')) {
      console.error('Error generating conversation summary:', error)
    }
  }

  // Fallback: Use enhanced keyword-based summary
  return generateEnhancedSummary(messages, existingSummary)
}

// Helper function to analyze latest conversation using LLM
export const analyzeLatestConversation = async (userId: string, classId: string | undefined, messages: any[], conversationTitle: string, conversationSummary?: string): Promise<{ sentiment: number; topics: { topic: string; count: number }[] }> => {
  if (messages.length === 0) {
    return { sentiment: 0, topics: [] }
  }

  // Check if LLM analytics is enabled (default: true for backward compatibility)
  const enableLLMAnalytics = process.env.ENABLE_LLM_ANALYTICS !== 'false'
  
  // If LLM analytics is disabled, skip directly to enhanced keyword-based fallback
  if (!enableLLMAnalytics) {
    return {
      sentiment: calculateEnhancedSentiment(messages.filter(m => m.role === 'user')),
      topics: extractEnhancedTopics(messages)
    }
  }

  try {
    // Use summary if available for faster analysis, otherwise use full conversation
    const conversationText = conversationSummary 
      ? `Conversation Summary: ${conversationSummary}\n\nRecent Messages (last 3):\n${messages.slice(-3).map((msg, index) => 
          `${msg.role === 'user' ? 'Student' : 'Assistant'}: ${msg.content}`
        ).join('\n\n')}`
      : messages.map((msg, index) => 
          `${msg.role === 'user' ? 'Student' : 'Assistant'}: ${msg.content}`
        ).join('\n\n')

    const prompt = `Analyze this student chat conversation and provide both sentiment analysis and topic extraction.

Conversation Title: ${conversationTitle}

Conversation:
${conversationText}

Please provide:
1. Sentiment score (-1 to +1, where -1 is very negative, 0 is neutral, +1 is very positive)
2. Top 3 main topics/themes discussed in this conversation

Respond in JSON format:
{
  "sentiment": 0.7,
  "topics": [
    {"topic": "Financial Planning", "count": 1},
    {"topic": "Investment Strategies", "count": 1},
    {"topic": "Risk Management", "count": 1}
  ]
}`

    // Use Remote Blackwell (vLLM) first, fallback to Remote A6000 Ollama
    const blackwellUrl = process.env.REMOTE_BLACKWELL_URL || 'http://localhost:8001/v1/chat/completions'
    const blackwellModel = process.env.REMOTE_BLACKWELL_MODEL || 'google/gemma-3-12b-it'
    const a6000Url = process.env.REMOTE_OLLAMA_URL || 'http://localhost:5001/api/generate'
    const a6000Model = process.env.REMOTE_OLLAMA_MODEL || 'gemma3:27b'
    
    let response: Response | null = null
    let responseText = ''
    
    // Try Blackwell first
    try {
      response = await fetch(blackwellUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: blackwellModel,
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 1000
        }),
        signal: AbortSignal.timeout(30000) // 30s timeout
      })
      
      if (response.ok) {
        const responseData = await response.json()
        responseText = responseData.choices?.[0]?.message?.content || ''
      }
    } catch (blackwellError) {
      // Blackwell failed, try A6000 as fallback
    }
    
    // Fallback to A6000 Ollama if Blackwell failed or didn't return text
    if (!responseText) {
      try {
        response = await fetch(a6000Url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: a6000Model,
            prompt: prompt,
            stream: false,
            options: {
              temperature: 0.3,
              top_p: 0.9
            }
          }),
          signal: AbortSignal.timeout(30000) // 30s timeout
        })
        
        if (response.ok) {
          const responseData = await response.json()
          responseText = responseData.response || ''
        }
      } catch (a6000Error) {
        // Both failed, will use fallback analysis below
        throw new Error('Both Blackwell and A6000 unavailable')
      }
    }

    if (responseText) {

      // Try to parse JSON response with robust extraction
      try {
        // Method 1: Try to find JSON object by matching balanced braces
        const firstBrace = responseText.indexOf('{')
        if (firstBrace !== -1) {
          let braceCount = 0
          let inString = false
          let escapeNext = false
          let jsonEnd = -1
          
          for (let i = firstBrace; i < responseText.length; i++) {
            const char = responseText[i]
            
            if (escapeNext) {
              escapeNext = false
              continue
            }
            
            if (char === '\\') {
              escapeNext = true
              continue
            }
            
            if (char === '"') {
              inString = !inString
              continue
            }
            
            if (!inString) {
              if (char === '{') braceCount++
              if (char === '}') {
                braceCount--
                if (braceCount === 0) {
                  jsonEnd = i + 1
                  break
                }
              }
            }
          }
          
          if (jsonEnd > firstBrace) {
            const jsonStr = responseText.substring(firstBrace, jsonEnd)
            const analysis = JSON.parse(jsonStr)
            return {
              sentiment: analysis.sentiment || 0,
              topics: analysis.topics || []
            }
          }
        }
      } catch (parseError) {
        console.error('Failed to parse LLM response:', parseError)
        // Try fallback regex method
        try {
          // Method 2: Try simple non-greedy match as fallback
          const jsonMatch = responseText.match(/\{[^}]*"sentiment"[^}]*\}/)
          if (jsonMatch) {
            const analysis = JSON.parse(jsonMatch[0])
            return {
              sentiment: analysis.sentiment || 0,
              topics: analysis.topics || []
            }
          }
        } catch (fallbackError) {
          console.error('Fallback JSON parsing also failed')
        }
      }
    }

    // Fallback to enhanced keyword-based analysis
    console.log('LLM analysis failed, using enhanced keyword-based fallback')
    return {
      sentiment: calculateEnhancedSentiment(messages.filter(m => m.role === 'user')),
      topics: extractEnhancedTopics(messages)
    }

  } catch (error) {
    // Silently fail for connection errors (expected when models aren't available)
    // Only log unexpected errors
    if (error instanceof Error && !error.message.includes('unavailable') && !error.message.includes('ECONNREFUSED')) {
      console.error('Error in LLM analysis:', error)
    }
    // Fallback to enhanced keyword-based analysis
    return {
      sentiment: calculateEnhancedSentiment(messages.filter(m => m.role === 'user')),
      topics: extractEnhancedTopics(messages)
    }
  }
}

// =============================================================================
// ENHANCED KEYWORD-BASED ANALYTICS (No LLM Required - Fast & Powerful)
// =============================================================================

/**
 * Enhanced conversation summary using extractive summarization
 * Uses sentence scoring based on word importance and position
 */
const generateEnhancedSummary = (messages: any[], existingSummary?: string): string => {
  if (existingSummary && messages.length <= 5) {
    return existingSummary // Keep existing if conversation hasn't grown much
  }

  const userMessages = messages.filter(m => m.role === 'user')
  if (userMessages.length === 0) {
    return 'No user messages found'
  }

  // Extract all sentences from user messages
  const sentences: { text: string; score: number; index: number }[] = []
  let globalIndex = 0

  userMessages.forEach((msg, msgIndex) => {
    const content = msg.content.trim()
    // Split into sentences (simple regex - handles . ! ?)
    const msgSentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10)
    
    msgSentences.forEach(sentence => {
      const trimmed = sentence.trim()
      if (trimmed.length > 0) {
        sentences.push({
          text: trimmed,
          score: 0,
          index: globalIndex++
        })
      }
    })
  })

  if (sentences.length === 0) {
    // Fallback to first message
    const firstMsg = userMessages[0]?.content || ''
    return `Student asked about: ${firstMsg.substring(0, 200)}${firstMsg.length > 200 ? '...' : ''}`
  }

  // Calculate word frequencies (TF)
  const wordFreq = new Map<string, number>()
  const allWords: string[] = []
  
  sentences.forEach(s => {
    const words = s.text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !isStopWord(w))
    
    words.forEach(word => {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1)
      allWords.push(word)
    })
  })

  // Calculate sentence scores
  sentences.forEach(sentence => {
    let score = 0
    const words = sentence.text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !isStopWord(w))
    
    // Score based on important words (higher frequency = more important)
    words.forEach(word => {
      const freq = wordFreq.get(word) || 0
      score += freq
    })
    
    // Boost first sentences (they often contain the main question)
    if (sentence.index < 2) {
      score *= 1.5
    }
    
    // Boost sentences with question words
    if (/^(what|how|why|when|where|can|could|would|should|is|are|do|does)/i.test(sentence.text)) {
      score *= 1.3
    }
    
    // Normalize by sentence length
    score = score / Math.max(words.length, 1)
    
    sentence.score = score
  })

  // Select top 2-3 sentences
  const topSentences = sentences
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(3, sentences.length))
    .sort((a, b) => a.index - b.index) // Maintain original order
    .map(s => s.text)
    .join('. ')

  return topSentences.length > 0 
    ? `${topSentences}${topSentences.endsWith('.') ? '' : '.'}`
    : `Student asked about: ${userMessages[0]?.content.substring(0, 200)}...`
}

/**
 * Enhanced sentiment analysis with negation handling and intensity modifiers
 */
const calculateEnhancedSentiment = (messages: any[]): number => {
  if (messages.length === 0) return 0

  // Expanded sentiment lexicons with weights
  const positiveWords = new Map<string, number>([
    // Strong positive
    ['excellent', 1.0], ['amazing', 1.0], ['brilliant', 1.0], ['perfect', 1.0],
    ['wonderful', 0.9], ['fantastic', 0.9], ['outstanding', 0.9], ['awesome', 0.9],
    // Moderate positive
    ['good', 0.7], ['great', 0.8], ['helpful', 0.7], ['useful', 0.6],
    ['clear', 0.6], ['understand', 0.6], ['understood', 0.6], ['makes sense', 0.7],
    ['correct', 0.7], ['right', 0.6], ['yes', 0.5], ['yeah', 0.5],
    // Gratitude
    ['thanks', 0.7], ['thank you', 0.8], ['appreciate', 0.7], ['grateful', 0.8],
    // Learning positive
    ['learned', 0.6], ['learning', 0.6], ['got it', 0.7], ['makes sense', 0.7],
    ['clear now', 0.7], ['understand now', 0.7]
  ])

  const negativeWords = new Map<string, number>([
    // Strong negative
    ['terrible', -1.0], ['awful', -1.0], ['horrible', -1.0], ['hate', -1.0],
    ['frustrated', -0.9], ['frustrating', -0.9], ['annoying', -0.8], ['useless', -0.9],
    // Moderate negative
    ['bad', -0.7], ['wrong', -0.7], ['incorrect', -0.7], ['unclear', -0.7],
    ['confused', -0.8], ['confusing', -0.8], ['difficult', -0.6], ['hard', -0.6],
    ['problem', -0.6], ['error', -0.7], ['stuck', -0.7], ['lost', -0.7],
    // Learning negative
    ["don't understand", -0.8], ["doesn't make sense", -0.8], ["can't understand", -0.8],
    ['no idea', -0.7], ['not clear', -0.7], ['still confused', -0.8]
  ])

  // Intensity modifiers
  const intensifiers = ['very', 'extremely', 'really', 'quite', 'super', 'incredibly', 'absolutely']
  const diminishers = ['slightly', 'a bit', 'somewhat', 'kind of', 'sort of']

  let totalSentiment = 0
  let messageCount = 0

  messages.forEach(message => {
    if (message.role === 'user') {
      const content = message.content.toLowerCase()
      let messageSentiment = 0

      // Check for positive words
      positiveWords.forEach((weight, word) => {
        const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
        const matches = content.match(regex)
        if (matches) {
          let wordSentiment = weight * matches.length
          
          // Check for intensifiers before the word
          const beforeWord = content.substring(Math.max(0, content.indexOf(word) - 30), content.indexOf(word))
          if (intensifiers.some(i => beforeWord.includes(i))) {
            wordSentiment *= 1.3
          } else if (diminishers.some(d => beforeWord.includes(d))) {
            wordSentiment *= 0.7
          }
          
          messageSentiment += wordSentiment
        }
      })

      // Check for negative words
      negativeWords.forEach((weight, word) => {
        const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
        const matches = content.match(regex)
        if (matches) {
          let wordSentiment = weight * matches.length
          
          // Check for intensifiers
          const beforeWord = content.substring(Math.max(0, content.indexOf(word) - 30), content.indexOf(word))
          if (intensifiers.some(i => beforeWord.includes(i))) {
            wordSentiment *= 1.3
          } else if (diminishers.some(d => beforeWord.includes(d))) {
            wordSentiment *= 0.7
          }
          
          messageSentiment += wordSentiment
        }
      })

      // Handle negations (e.g., "not good", "isn't helpful")
      const negationPatterns = [
        /\b(not|isn't|aren't|wasn't|weren't|don't|doesn't|didn't|can't|couldn't|won't|wouldn't|shouldn't)\s+(\w+)/gi
      ]
      
      negationPatterns.forEach(pattern => {
        const matches = Array.from(content.matchAll(pattern))
        matches.forEach(match => {
          const word = match[2]
          // If negated word is positive, flip to negative
          if (positiveWords.has(word)) {
            messageSentiment -= positiveWords.get(word)! * 0.8
            messageSentiment -= 0.3 // Additional negative boost
          }
          // If negated word is negative, it becomes less negative
          if (negativeWords.has(word)) {
            messageSentiment -= negativeWords.get(word)! * 0.5
          }
        })
      })

      totalSentiment += messageSentiment
      messageCount++
    }
  })

  if (messageCount === 0) return 0

  // Normalize sentiment to -1 to 1 range
  const avgSentiment = totalSentiment / messageCount
  return Math.max(-1, Math.min(1, avgSentiment))
}

/**
 * Enhanced topic extraction using TF-IDF-like scoring with n-grams
 */
const extractEnhancedTopics = (messages: any[]): { topic: string; count: number }[] => {
  const topicScores = new Map<string, number>()
  const allUserText: string[] = []

  // Collect all user messages
  messages.forEach(msg => {
    if (msg.role === 'user') {
      allUserText.push(msg.content.toLowerCase())
    }
  })

  if (allUserText.length === 0) return []

  // Extract unigrams (single words)
  const unigrams = new Map<string, number>()
  // Extract bigrams (2-word phrases)
  const bigrams = new Map<string, number>()
  // Extract trigrams (3-word phrases) for important concepts
  const trigrams = new Map<string, number>()

  allUserText.forEach(text => {
    // Clean and tokenize
    const words = text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !isStopWord(w))

    // Count unigrams
    words.forEach(word => {
      if (word.length > 4) { // Only longer words for topics
        unigrams.set(word, (unigrams.get(word) || 0) + 1)
      }
    })

    // Extract bigrams
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`
      if (words[i].length > 3 && words[i + 1].length > 3) {
        bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1)
      }
    }

    // Extract trigrams for technical terms
    for (let i = 0; i < words.length - 2; i++) {
      const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`
      if (words[i].length > 3 && words[i + 1].length > 2 && words[i + 2].length > 3) {
        trigrams.set(trigram, (trigrams.get(trigram) || 0) + 1)
      }
    }
  })

  // Score topics (TF-IDF-like: frequency * importance)
  // Bigrams and trigrams get higher scores as they're more specific
  bigrams.forEach((count, bigram) => {
    if (count >= 2) { // Only if appears at least twice
      topicScores.set(bigram, count * 2) // Bigrams weighted 2x
    }
  })

  trigrams.forEach((count, trigram) => {
    if (count >= 2) {
      topicScores.set(trigram, count * 3) // Trigrams weighted 3x
    }
  })

  // Add high-frequency unigrams
  unigrams.forEach((count, word) => {
    if (count >= 2 && word.length > 5) {
      // Check if word is not part of a bigram/trigram (avoid duplicates)
      let isPartOfPhrase = false
      bigrams.forEach((_, bigram) => {
        if (bigram.includes(word)) isPartOfPhrase = true
      })
      trigrams.forEach((_, trigram) => {
        if (trigram.includes(word)) isPartOfPhrase = true
      })
      
      if (!isPartOfPhrase) {
        topicScores.set(word, count)
      }
    }
  })

  // Convert to array and sort
  return Array.from(topicScores.entries())
    .map(([topic, score]) => ({ topic: capitalizeTopic(topic), count: Math.round(score) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
}

// Helper: Check if word is a stopword
const isStopWord = (word: string): boolean => {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must',
    'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
    'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can',
    'just', 'about', 'into', 'through', 'during', 'including', 'against', 'among',
    'throughout', 'despite', 'towards', 'upon', 'concerning', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'up', 'about', 'into', 'through', 'during'
  ])
  return stopWords.has(word.toLowerCase())
}

// Helper: Capitalize topic for display
const capitalizeTopic = (topic: string): string => {
  return topic.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Helper function to extract simple topics as fallback
const extractSimpleTopics = (messages: any[]): { topic: string; count: number }[] => {
  const topicCounts = new Map<string, number>()
  
  messages.forEach(msg => {
    if (msg.role === 'user') {
      const content = msg.content.toLowerCase()
      // Extract meaningful words
      const words = content.split(/\s+/).filter(word => 
        word.length > 5 && 
        !['this', 'that', 'with', 'from', 'they', 'have', 'been', 'were', 'said', 'each', 'which', 'their', 'time', 'will', 'about', 'there', 'could', 'other', 'after', 'first', 'well', 'also', 'where', 'much', 'some', 'very', 'when', 'here', 'just', 'into', 'over', 'think', 'more', 'your', 'work', 'know', 'like', 'make', 'year', 'good', 'take', 'most'].includes(word)
      )
      
      words.forEach(word => {
        topicCounts.set(word, (topicCounts.get(word) || 0) + 1)
      })
    }
  })

  return Array.from(topicCounts.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
}

// Helper function to calculate sentiment using LLM (legacy - keeping for compatibility)
const calculateLLMSentiment = async (userId: string, classId: string | undefined, messages: any[]): Promise<number> => {
  if (messages.length === 0) return 0
  
  try {
    // Call the sentiment analysis API
    const response = await fetch('http://localhost:3000/api/analytics/sentiment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, classId })
    })

    if (response.ok) {
      const data = await response.json()
      return data.sentiment || 0
    } else {
      console.error('Sentiment analysis API failed:', response.status)
      // Fallback to simple analysis
      return calculateSimpleSentiment(messages)
    }
  } catch (error) {
    console.error('Error calling sentiment analysis API:', error)
    // Fallback to simple analysis
    return calculateSimpleSentiment(messages)
  }
}

// Fallback sentiment analysis using keywords
const calculateSimpleSentiment = (messages: any[]): number => {
  if (messages.length === 0) return 0
  
  let positiveCount = 0
  let negativeCount = 0
  let totalCount = 0
  
  const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'helpful', 'thanks', 'thank you', 'yes', 'correct', 'right', 'understand', 'clear', 'perfect', 'awesome', 'brilliant', 'love', 'appreciate']
  const negativeWords = ['bad', 'wrong', 'confused', 'difficult', 'hard', 'no', 'incorrect', 'unclear', 'problem', 'error', 'stuck', 'help', 'don\'t understand', 'terrible', 'awful', 'hate', 'frustrated', 'annoying']
  
  messages.forEach(message => {
    if (message.role === 'user') {
      const content = message.content.toLowerCase()
      const positiveMatches = positiveWords.filter(word => content.includes(word)).length
      const negativeMatches = negativeWords.filter(word => content.includes(word)).length
      
      positiveCount += positiveMatches
      negativeCount += negativeMatches
      totalCount += 1
    }
  })
  
  if (totalCount === 0) return 0
  
  const sentiment = (positiveCount - negativeCount) / totalCount
  return Math.max(-1, Math.min(1, sentiment)) // Clamp between -1 and 1
}

export const getStudentActivitiesByClass = async (classId: string): Promise<StudentActivity[]> => {
  const classItem = await getClassById(classId)
  if (!classItem) return []

  const activities = await Promise.all(
    classItem.studentIds.map((studentId) => getStudentActivity(studentId))
  )
  
  return activities
}

// RAG Conversation operations
export const getRAGConversationsByUser = async (userId: string, classId?: string, chatType?: 'class_material' | 'syllabus'): Promise<RAGConversation[]> => {
  const client = await pool.connect()
  try {
    let query = 'SELECT * FROM rag_conversations WHERE user_id = $1 AND status = $2'
    const params: any[] = [userId, 'active']
    
    if (classId) {
      query += ' AND class_id = $3'
      params.push(classId)
    }
    
    // Filter by chat type if provided
    if (chatType) {
      const nextParamIndex = params.length + 1
      query += ` AND chat_type = $${nextParamIndex}`
      params.push(chatType)
    }
    
    query += ' ORDER BY updated_at DESC'
    
    const result = await client.query(query, params)
    return result.rows.map(row => ({
      id: row.id.toString(),
      userId: row.user_id.toString(),
      classId: row.class_id?.toString(),
      chatType: row.chat_type as 'class_material' | 'syllabus' | undefined,
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      status: row.status as 'active' | 'archived',
      currentTopic: row.current_topic,
      checkpointState: row.checkpoint_state,
      messageHistory: row.message_history || [],
      studentProblemData: row.student_problem_data || {
        numbers: [],
        problem_type: undefined,
        chapter: undefined
      },
      cachedContext: row.cached_context,
      lastRetrievalTopic: row.last_retrieval_topic,
      cachedSentiment: row.cached_sentiment ? parseFloat(row.cached_sentiment) : undefined,
      cachedTopics: row.cached_topics || undefined,
      analyticsLastUpdated: row.analytics_last_updated ? new Date(row.analytics_last_updated) : undefined,
      conversationSummary: row.conversation_summary || undefined
    }))
  } finally {
    client.release()
  }
}

export const getRAGConversationById = async (id: string): Promise<RAGConversation | null> => {
  // Validate input
  if (!id || id === 'undefined' || id === 'null') {
    console.error('Invalid conversation ID:', id)
    return null
  }

  const client = await pool.connect()
  try {
    const result = await client.query('SELECT * FROM rag_conversations WHERE id = $1', [id])
    if (result.rows.length === 0) return null
    
    const row = result.rows[0]
    return {
      id: row.id.toString(),
      userId: row.user_id.toString(),
      classId: row.class_id?.toString(),
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      status: row.status as 'active' | 'archived',
      currentTopic: row.current_topic,
      checkpointState: row.checkpoint_state,
      messageHistory: row.message_history || [],
      studentProblemData: row.student_problem_data || {
        numbers: [],
        problem_type: undefined,
        chapter: undefined
      },
      cachedContext: row.cached_context,
      lastRetrievalTopic: row.last_retrieval_topic,
      cachedSentiment: row.cached_sentiment ? parseFloat(row.cached_sentiment) : undefined,
      cachedTopics: row.cached_topics || undefined,
      analyticsLastUpdated: row.analytics_last_updated ? new Date(row.analytics_last_updated) : undefined,
      conversationSummary: row.conversation_summary || undefined
    }
  } finally {
    client.release()
  }
}

export const createRAGConversation = async (userId: string, title?: string, classId?: string, chatType: 'class_material' | 'syllabus' = 'class_material'): Promise<RAGConversation> => {
  const client = await pool.connect()
  try {
    const conversationTitle = title || `Chat ${new Date().toLocaleDateString()}`
    const result = await client.query(
      `INSERT INTO rag_conversations (user_id, class_id, title, chat_type, checkpoint_state, message_history, student_problem_data) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [
        userId, 
        classId || null,
        conversationTitle,
        chatType,
        JSON.stringify({
          checkpoint_1_passed: false,
          checkpoint_2_passed: false,
          checkpoint_3_passed: false,
          understanding_level: 0,
          awaiting_student_response: true
        }),
        JSON.stringify([]),
        JSON.stringify({
          numbers: [],
          problem_type: undefined,
          chapter: undefined
        })
      ]
    )
    
    const row = result.rows[0]
    console.log("Database created conversation row:", row)
    
    const conversation = {
      id: row.id.toString(),
      userId: row.user_id.toString(),
      classId: row.class_id?.toString(),
      chatType: row.chat_type as 'class_material' | 'syllabus' | undefined,
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      status: row.status as 'active' | 'archived',
      currentTopic: row.current_topic,
      checkpointState: row.checkpoint_state,
      messageHistory: row.message_history || [],
      studentProblemData: row.student_problem_data || {
        numbers: [],
        problem_type: undefined,
        chapter: undefined
      },
      cachedContext: row.cached_context,
      lastRetrievalTopic: row.last_retrieval_topic,
      cachedSentiment: row.cached_sentiment ? parseFloat(row.cached_sentiment) : undefined,
      cachedTopics: row.cached_topics || undefined,
      analyticsLastUpdated: row.analytics_last_updated ? new Date(row.analytics_last_updated) : undefined,
      conversationSummary: row.conversation_summary || undefined
    }
    
    // Copy to history table when created (non-blocking)
    // History table always has a copy - we'll update its status to 'archived' when deleted
    try {
      await client.query(
        `INSERT INTO rag_conversations_history (
          original_id, user_id, class_id, title, status, current_topic,
          checkpoint_state, message_history, student_problem_data, cached_context,
          last_retrieval_topic, cached_sentiment, cached_topics, analytics_last_updated,
          conversation_summary, chat_type, original_created_at, original_updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, $13::jsonb, $14, $15, $16, $17, $18)`,
        [
          parseInt(conversation.id),
          parseInt(conversation.userId),
          conversation.classId ? parseInt(conversation.classId) : null,
          conversation.title,
          conversation.status || 'active',
          conversation.currentTopic || null,
          toJsonString(conversation.checkpointState || {}),
          toJsonString(conversation.messageHistory || []),
          toJsonString(conversation.studentProblemData || {}),
          toJsonString(conversation.cachedContext),
          conversation.lastRetrievalTopic || null,
          conversation.cachedSentiment || 0,
          toJsonString(conversation.cachedTopics),
          conversation.analyticsLastUpdated || null,
          conversation.conversationSummary || null,
          conversation.chatType || 'class_material',
          conversation.createdAt,
          conversation.updatedAt
        ]
      )
      console.log(`[DB] ✅ Copied new conversation ${conversation.id} to history table`)
    } catch (err) {
      console.error(`[DB] Failed to copy new conversation to history:`, err)
      // Non-critical, continue
    }
    
    console.log("Formatted conversation:", conversation)
    return conversation
  } finally {
    client.release()
  }
}

// Assignment operations
export const getAssignmentsByClass = async (classId: string): Promise<Assignment[]> => {
  const client = await pool.connect()
  try {
    const result = await client.query(
      'SELECT * FROM assignments WHERE class_id = $1 ORDER BY created_at DESC',
      [classId]
    )
    return result.rows.map(row => ({
      id: row.id.toString(),
      classId: row.class_id.toString(),
      facultyId: row.faculty_id.toString(),
      name: row.name,
      dueDate: new Date(row.due_date),
      canvasLink: row.canvas_link || undefined,
      pdfFileName: row.pdf_file_name,
      createdAt: new Date(row.created_at)
    }))
  } finally {
    client.release()
  }
}

export const getAssignmentsByStudent = async (studentId: string): Promise<Assignment[]> => {
  const client = await pool.connect()
  try {
    // Get assignments for classes where the student is enrolled
    const result = await client.query(
      `SELECT a.* FROM assignments a
       INNER JOIN class_students cs ON a.class_id = cs.class_id
       WHERE cs.student_id = $1
       ORDER BY a.created_at DESC`,
      [studentId]
    )
    return result.rows.map(row => ({
      id: row.id.toString(),
      classId: row.class_id.toString(),
      facultyId: row.faculty_id.toString(),
      name: row.name,
      dueDate: new Date(row.due_date),
      canvasLink: row.canvas_link || undefined,
      pdfFileName: row.pdf_file_name,
      createdAt: new Date(row.created_at)
    }))
  } finally {
    client.release()
  }
}

export const getAssignmentsByFaculty = async (facultyId: string): Promise<Assignment[]> => {
  const client = await pool.connect()
  try {
    const result = await client.query(
      'SELECT * FROM assignments WHERE faculty_id = $1 ORDER BY created_at DESC',
      [facultyId]
    )
    return result.rows.map(row => ({
      id: row.id.toString(),
      classId: row.class_id.toString(),
      facultyId: row.faculty_id.toString(),
      name: row.name,
      dueDate: new Date(row.due_date),
      canvasLink: row.canvas_link || undefined,
      pdfFileName: row.pdf_file_name,
      createdAt: new Date(row.created_at)
    }))
  } finally {
    client.release()
  }
}

export const getAssignmentById = async (id: string): Promise<Assignment | null> => {
  const client = await pool.connect()
  try {
    const result = await client.query('SELECT * FROM assignments WHERE id = $1', [id])
    if (result.rows.length === 0) return null
    
    const row = result.rows[0]
    return {
      id: row.id.toString(),
      classId: row.class_id.toString(),
      facultyId: row.faculty_id.toString(),
      name: row.name,
      dueDate: new Date(row.due_date),
      canvasLink: row.canvas_link || undefined,
      pdfFileName: row.pdf_file_name,
      createdAt: new Date(row.created_at)
    }
  } finally {
    client.release()
  }
}

export const createAssignment = async (assignment: Omit<Assignment, 'id' | 'createdAt'>): Promise<Assignment> => {
  const client = await pool.connect()
  try {
    const result = await client.query(
      `INSERT INTO assignments (class_id, faculty_id, name, due_date, canvas_link, pdf_file_name) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, created_at`,
      [
        assignment.classId,
        assignment.facultyId,
        assignment.name,
        assignment.dueDate,
        assignment.canvasLink || null,
        assignment.pdfFileName
      ]
    )
    
    const row = result.rows[0]
    return {
      ...assignment,
      id: row.id.toString(),
      createdAt: new Date(row.created_at)
    }
  } finally {
    client.release()
  }
}

// Resource operations
export const getResourcesByClass = async (classId: string): Promise<Resource[]> => {
  const client = await pool.connect()
  try {
    const result = await client.query(
      'SELECT * FROM resources WHERE class_id = $1 ORDER BY uploaded_at DESC',
      [classId]
    )
    return result.rows.map(row => ({
      id: row.id.toString(),
      classId: row.class_id.toString(),
      facultyId: row.faculty_id.toString(),
      fileName: row.file_name,
      fileSize: parseInt(row.file_size),
      uploadedAt: new Date(row.uploaded_at)
    }))
  } finally {
    client.release()
  }
}

export const getResourceById = async (id: string): Promise<Resource | null> => {
  const client = await pool.connect()
  try {
    const result = await client.query('SELECT * FROM resources WHERE id = $1', [id])
    if (result.rows.length === 0) return null
    
    const row = result.rows[0]
    return {
      id: row.id.toString(),
      classId: row.class_id.toString(),
      facultyId: row.faculty_id.toString(),
      fileName: row.file_name,
      fileSize: parseInt(row.file_size),
      uploadedAt: new Date(row.uploaded_at)
    }
  } finally {
    client.release()
  }
}

export const createResource = async (resource: Omit<Resource, 'id' | 'uploadedAt'>): Promise<Resource> => {
  const client = await pool.connect()
  try {
    const result = await client.query(
      `INSERT INTO resources (class_id, faculty_id, file_name, file_size) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, uploaded_at`,
      [
        resource.classId,
        resource.facultyId,
        resource.fileName,
        resource.fileSize
      ]
    )
    
    const row = result.rows[0]
    return {
      ...resource,
      id: row.id.toString(),
      uploadedAt: new Date(row.uploaded_at)
    }
  } finally {
    client.release()
  }
}

export const deleteResourceById = async (id: string): Promise<boolean> => {
  const client = await pool.connect()
  try {
    const result = await client.query('DELETE FROM resources WHERE id = $1', [id])
    return result.rowCount !== null && result.rowCount > 0
  } finally {
    client.release()
  }
}

export const getResourceByFileName = async (classId: string, fileName: string): Promise<Resource | null> => {
  const client = await pool.connect()
  try {
    const result = await client.query(
      'SELECT * FROM resources WHERE class_id = $1 AND file_name = $2',
      [classId, fileName]
    )
    if (result.rows.length === 0) return null
    
    const row = result.rows[0]
    return {
      id: row.id.toString(),
      classId: row.class_id.toString(),
      facultyId: row.faculty_id.toString(),
      fileName: row.file_name,
      fileSize: parseInt(row.file_size),
      uploadedAt: new Date(row.uploaded_at)
    }
  } finally {
    client.release()
  }
}

export const updateRAGConversation = async (id: string, updates: Partial<RAGConversation>): Promise<RAGConversation | null> => {
  const client = await pool.connect()
  try {
    const updateFields = []
    const values = []
    let paramCount = 1

    if (updates.title !== undefined) {
      updateFields.push(`title = $${paramCount}`)
      values.push(updates.title)
      paramCount++
    }
    if (updates.status !== undefined) {
      updateFields.push(`status = $${paramCount}`)
      values.push(updates.status)
      paramCount++
    }
    if (updates.currentTopic !== undefined) {
      updateFields.push(`current_topic = $${paramCount}`)
      values.push(updates.currentTopic)
      paramCount++
    }
    if (updates.checkpointState !== undefined) {
      updateFields.push(`checkpoint_state = $${paramCount}`)
      values.push(JSON.stringify(updates.checkpointState))
      paramCount++
    }
    if (updates.messageHistory !== undefined) {
      updateFields.push(`message_history = $${paramCount}`)
      values.push(JSON.stringify(updates.messageHistory))
      paramCount++
    }
    if (updates.studentProblemData !== undefined) {
      updateFields.push(`student_problem_data = $${paramCount}`)
      values.push(JSON.stringify(updates.studentProblemData))
      paramCount++
    }
    if (updates.cachedContext !== undefined) {
      updateFields.push(`cached_context = $${paramCount}`)
      values.push(JSON.stringify(updates.cachedContext))
      paramCount++
    }
    if (updates.lastRetrievalTopic !== undefined) {
      updateFields.push(`last_retrieval_topic = $${paramCount}`)
      values.push(updates.lastRetrievalTopic)
      paramCount++
    }
    if (updates.cachedSentiment !== undefined) {
      updateFields.push(`cached_sentiment = $${paramCount}`)
      values.push(updates.cachedSentiment)
      paramCount++
    }
    if (updates.cachedTopics !== undefined) {
      updateFields.push(`cached_topics = $${paramCount}`)
      values.push(JSON.stringify(updates.cachedTopics))
      paramCount++
    }
    if (updates.analyticsLastUpdated !== undefined) {
      updateFields.push(`analytics_last_updated = $${paramCount}`)
      values.push(updates.analyticsLastUpdated)
      paramCount++
    }
    if (updates.conversationSummary !== undefined) {
      updateFields.push(`conversation_summary = $${paramCount}`)
      values.push(updates.conversationSummary)
      paramCount++
    }

    if (updateFields.length === 0) {
      return await getRAGConversationById(id)
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`)
    values.push(id)

    const result = await client.query(
      `UPDATE rag_conversations SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    )

    if (result.rows.length === 0) return null

    const row = result.rows[0]
    return {
      id: row.id.toString(),
      userId: row.user_id.toString(),
      classId: row.class_id?.toString(),
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      status: row.status as 'active' | 'archived',
      currentTopic: row.current_topic,
      checkpointState: row.checkpoint_state,
      messageHistory: row.message_history || [],
      studentProblemData: row.student_problem_data || {
        numbers: [],
        problem_type: undefined,
        chapter: undefined
      },
      cachedContext: row.cached_context,
      lastRetrievalTopic: row.last_retrieval_topic,
      cachedSentiment: row.cached_sentiment ? parseFloat(row.cached_sentiment) : undefined,
      cachedTopics: row.cached_topics || undefined,
      analyticsLastUpdated: row.analytics_last_updated ? new Date(row.analytics_last_updated) : undefined,
      conversationSummary: row.conversation_summary || undefined
    }
  } finally {
    client.release()
  }
}

/**
 * Helper function to safely convert to JSON string for JSONB fields
 */
const toJsonString = (value: any): string | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    // Already a string, validate it's valid JSON
    try {
      JSON.parse(value)
      return value
    } catch {
      // Invalid JSON string, stringify it
      return JSON.stringify(value)
    }
  }
  // It's an object, stringify it
  return JSON.stringify(value)
}

/**
 * Helper function to sync conversation to history table
 * Updates the history entry with latest state from main table
 */
const syncConversationToHistory = async (conversationId: string, client: any): Promise<void> => {
  try {
    // Get the full conversation using the same client
    const result = await client.query(
      `SELECT * FROM rag_conversations WHERE id = $1`,
      [parseInt(conversationId)]
    )
    
    if (result.rows.length === 0) {
      console.log(`[DB] Conversation ${conversationId} not found, skipping history sync`)
      return
    }
    
    const row = result.rows[0]

    // Check if this conversation already exists in history
    const existingCheck = await client.query(
      `SELECT id FROM rag_conversations_history WHERE original_id = $1`,
      [parseInt(conversationId)]
    )

    if (existingCheck.rows.length > 0) {
      // Update existing history entry with latest state
      await client.query(
        `UPDATE rag_conversations_history SET
          user_id = $1,
          class_id = $2,
          title = $3,
          status = $4,
          current_topic = $5,
          checkpoint_state = $6::jsonb,
          message_history = $7::jsonb,
          student_problem_data = $8::jsonb,
          cached_context = $9::jsonb,
          last_retrieval_topic = $10,
          cached_sentiment = $11,
          cached_topics = $12::jsonb,
          analytics_last_updated = $13,
          conversation_summary = $14,
          chat_type = $15,
          original_updated_at = $16
        WHERE original_id = $17`,
        [
          row.user_id,
          row.class_id,
          row.title,
          row.status || 'active',
          row.current_topic,
          toJsonString(row.checkpoint_state),
          toJsonString(row.message_history),
          toJsonString(row.student_problem_data),
          toJsonString(row.cached_context),
          row.last_retrieval_topic,
          row.cached_sentiment || 0,
          toJsonString(row.cached_topics),
          row.analytics_last_updated,
          row.conversation_summary,
          row.chat_type || 'class_material',
          row.updated_at,
          parseInt(conversationId)
        ]
      )
    } else {
      // Insert new history entry (shouldn't happen if created properly, but handle it)
      await client.query(
        `INSERT INTO rag_conversations_history (
          original_id, user_id, class_id, title, status, current_topic,
          checkpoint_state, message_history, student_problem_data, cached_context,
          last_retrieval_topic, cached_sentiment, cached_topics, analytics_last_updated,
          conversation_summary, chat_type, original_created_at, original_updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, $13::jsonb, $14, $15, $16, $17, $18)`,
        [
          parseInt(conversationId),
          row.user_id,
          row.class_id,
          row.title,
          row.status || 'active',
          row.current_topic,
          toJsonString(row.checkpoint_state),
          toJsonString(row.message_history),
          toJsonString(row.student_problem_data),
          toJsonString(row.cached_context),
          row.last_retrieval_topic,
          row.cached_sentiment || 0,
          toJsonString(row.cached_topics),
          row.analytics_last_updated,
          row.conversation_summary,
          row.chat_type || 'class_material',
          row.created_at,
          row.updated_at
        ]
      )
    }
    console.log(`[DB] ✅ Synced conversation ${conversationId} to history table`)
  } catch (error) {
    console.error(`[DB] ❌ Error syncing conversation ${conversationId} to history:`, error)
    // Don't throw - history is non-critical
  }
}

/**
 * Delete a conversation - updates status in history to 'archived', then deletes from main table
 * History table already has a copy (created when conversation was created)
 * This ensures deleted conversations are preserved in history but removed from active analytics
 */
export const archiveRAGConversation = async (id: string): Promise<void> => {
  const client = await pool.connect()
  try {
    // Sync latest state to history (in case there were updates)
    await syncConversationToHistory(id, client)
    
    // Update status to 'archived' in history table
    await client.query(
      `UPDATE rag_conversations_history 
       SET status = 'archived', archived_at = CURRENT_TIMESTAMP 
       WHERE original_id = $1`,
      [parseInt(id)]
    )
    
    // Actually DELETE from main table
    await client.query(
      `DELETE FROM rag_conversations WHERE id = $1`,
      [parseInt(id)]
    )
    
    console.log(`[DB] ✅ Deleted conversation ${id} (marked as archived in history)`)
  } catch (error) {
    console.error(`[DB] ❌ Error deleting conversation ${id}:`, error)
    throw error
  } finally {
    client.release()
  }
}

export const addRAGMessage = async (conversationId: string, role: 'user' | 'assistant', content: string, metadata?: any): Promise<void> => {
  console.log(`[DB] Adding ${role} message to conversation ${conversationId}`)
  const client = await pool.connect()
  try {
    // Get current conversation
    const conversation = await getRAGConversationById(conversationId)
    if (!conversation) {
      console.error(`[DB] Conversation ${conversationId} not found`)
      return
    }

    console.log(`[DB] Current conversation has ${conversation.messageHistory.length} messages`)

    // Add new message to history
    const newMessage = {
      role,
      content,
      timestamp: new Date(),
      metadata
    }

    const updatedHistory = [...conversation.messageHistory, newMessage]
    console.log(`[DB] Updated history will have ${updatedHistory.length} messages`)

    // Update conversation with new message
    await updateRAGConversation(conversationId, { 
      messageHistory: updatedHistory 
    })
    
    console.log(`[DB] Successfully updated conversation ${conversationId} with new message`)

    // CACHE ANALYTICS & SUMMARY: After every assistant response, analyze and cache sentiment/topics/summary
    if (role === 'assistant' && updatedHistory.length >= 2) {
      console.log(`[DB] Triggering analytics cache update for conversation ${conversationId}`)
      
      // Run analysis asynchronously (don't block the response)
      setImmediate(async () => {
        try {
          // Generate/update conversation summary first
          const existingSummary = conversation.conversationSummary
          const newSummary = await generateConversationSummary(updatedHistory, existingSummary)
          
          // Then analyze with the summary for faster processing
          const analysisResult = await analyzeLatestConversation(
            conversation.userId,
            conversation.classId,
            updatedHistory,
            conversation.title,
            newSummary // Pass summary for faster analysis
          )
          
          // Cache the results (summary + analytics)
          await updateRAGConversation(conversationId, {
            conversationSummary: newSummary,
            cachedSentiment: analysisResult.sentiment,
            cachedTopics: analysisResult.topics,
            analyticsLastUpdated: new Date()
          })
          
          console.log(`[DB] ✅ Analytics cached for conversation ${conversationId}:`, {
            sentiment: analysisResult.sentiment,
            topics: analysisResult.topics.map(t => t.topic).join(', '),
            summaryLength: newSummary.length
          })
        } catch (error) {
          console.error(`[DB] ❌ Failed to cache analytics for conversation ${conversationId}:`, error)
          // Don't throw - this is background processing
        }
      })
    }
  } finally {
    client.release()
  }
}
