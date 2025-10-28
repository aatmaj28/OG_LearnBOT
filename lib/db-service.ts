import pool from './db'
import type { User, Class, ChatMessage, ChatSession, ChatAnalytics, StudentActivity, RAGConversation } from './types'

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
      GROUP BY c.id, c.name, c.description, c.faculty_id, c.created_at
      ORDER BY c.created_at DESC
    `)
    
    return result.rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      description: row.description,
      facultyId: row.faculty_id.toString(),
      studentIds: row.student_ids.map((id: number) => id.toString()),
      vectorStoreFolder: row.vector_store_folder || null,
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
      GROUP BY c.id, c.name, c.description, c.faculty_id, c.created_at
    `, [id])
    
    if (result.rows.length === 0) return null
    
    const row = result.rows[0]
    return {
      id: row.id.toString(),
      name: row.name,
      description: row.description,
      facultyId: row.faculty_id.toString(),
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
      GROUP BY c.id, c.name, c.description, c.faculty_id, c.created_at
      ORDER BY c.created_at DESC
    `, [facultyId])
    
    return result.rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      description: row.description,
      facultyId: row.faculty_id.toString(),
      studentIds: row.student_ids.map((id: number) => id.toString()),
      vectorStoreFolder: row.vector_store_folder || null,
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
      GROUP BY c.id, c.name, c.description, c.faculty_id, c.created_at
      ORDER BY c.created_at DESC
    `, [studentId])
    
    return result.rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      description: row.description,
      facultyId: row.faculty_id.toString(),
      studentIds: row.student_ids.map((id: number) => id.toString()),
      vectorStoreFolder: row.vector_store_folder || null,
      createdAt: new Date(row.created_at)
    }))
  } finally {
    client.release()
  }
}

export const createClass = async (classData: Omit<Class, 'id' | 'createdAt'>): Promise<Class> => {
  const client = await pool.connect()
  try {
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
      // Clean up vector store folder if it exists
      try {
        const fs = require('fs')
        const path = require('path')
        const vectorStorePath = path.join(process.cwd(), 'vector_stores', classExists.vectorStoreFolder || '')
        
        if (fs.existsSync(vectorStorePath)) {
          fs.rmSync(vectorStorePath, { recursive: true, force: true })
          console.log(`🗑️ Deleted vector store folder: ${classExists.vectorStoreFolder}`)
        }
      } catch (error) {
        console.warn('Failed to delete vector store folder:', error)
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
export const getStudentActivity = async (userId: string, classId?: string): Promise<StudentActivity> => {
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
      // Get latest conversation messages for LLM analysis
      const latestMessages = latestConversation.messageHistory
      
      // Calculate sentiment and extract topics from latest conversation using LLM
      const analysisResult = await analyzeLatestConversation(userId, classId, latestMessages, latestConversation.title)
      averageSentiment = analysisResult.sentiment
      topTopics = analysisResult.topics
      
      console.log(`[v0] Latest conversation analysis for user ${userId}:`, {
        sentiment: averageSentiment,
        topics: topTopics,
        conversationTitle: latestConversation.title
      })
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

// Helper function to analyze latest conversation using LLM
const analyzeLatestConversation = async (userId: string, classId: string | undefined, messages: any[], conversationTitle: string): Promise<{ sentiment: number; topics: { topic: string; count: number }[] }> => {
  if (messages.length === 0) {
    return { sentiment: 0, topics: [] }
  }

  try {
    // Prepare conversation for LLM analysis
    const conversationText = messages.map((msg, index) => 
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

    // Call Ollama for analysis
    const ollamaResponse = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral:latest',
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.3,
          top_p: 0.9
        }
      })
    })

    if (ollamaResponse.ok) {
      const ollamaData = await ollamaResponse.json()
      const responseText = ollamaData.response

      // Try to parse JSON response
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const analysis = JSON.parse(jsonMatch[0])
          return {
            sentiment: analysis.sentiment || 0,
            topics: analysis.topics || []
          }
        }
      } catch (parseError) {
        console.error('Failed to parse LLM response:', parseError)
      }
    }

    // Fallback to simple analysis
    console.log('LLM analysis failed, using fallback')
    return {
      sentiment: calculateSimpleSentiment(messages.filter(m => m.role === 'user')),
      topics: extractSimpleTopics(messages)
    }

  } catch (error) {
    console.error('Error in LLM analysis:', error)
    // Fallback to simple analysis
    return {
      sentiment: calculateSimpleSentiment(messages.filter(m => m.role === 'user')),
      topics: extractSimpleTopics(messages)
    }
  }
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
export const getRAGConversationsByUser = async (userId: string, classId?: string): Promise<RAGConversation[]> => {
  const client = await pool.connect()
  try {
    let query = 'SELECT * FROM rag_conversations WHERE user_id = $1 AND status = $2'
    const params: any[] = [userId, 'active']
    
    if (classId) {
      query += ' AND class_id = $3'
      params.push(classId)
    }
    
    query += ' ORDER BY updated_at DESC'
    
    const result = await client.query(query, params)
    return result.rows.map(row => ({
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
      lastRetrievalTopic: row.last_retrieval_topic
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
      lastRetrievalTopic: row.last_retrieval_topic
    }
  } finally {
    client.release()
  }
}

export const createRAGConversation = async (userId: string, title?: string, classId?: string): Promise<RAGConversation> => {
  const client = await pool.connect()
  try {
    const conversationTitle = title || `Chat ${new Date().toLocaleDateString()}`
    const result = await client.query(
      `INSERT INTO rag_conversations (user_id, class_id, title, checkpoint_state, message_history, student_problem_data) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [
        userId, 
        classId || null,
        conversationTitle,
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
      lastRetrievalTopic: row.last_retrieval_topic
    }
    
    console.log("Formatted conversation:", conversation)
    return conversation
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
      lastRetrievalTopic: row.last_retrieval_topic
    }
  } finally {
    client.release()
  }
}

export const archiveRAGConversation = async (id: string): Promise<void> => {
  await updateRAGConversation(id, { status: 'archived' })
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
  } finally {
    client.release()
  }
}
