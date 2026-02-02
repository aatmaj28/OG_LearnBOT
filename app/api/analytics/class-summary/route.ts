import { type NextRequest, NextResponse } from "next/server"
import { getClassById, getUserById, getStudentActivity, getRAGConversationsByUser } from "@/lib/db-service"
import { ensureDatabaseInitialized } from "@/lib/init-db"

export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseInitialized()
    
    const { searchParams } = new URL(request.url)
    const classId = searchParams.get("classId")

    if (!classId) {
      return NextResponse.json({ error: "Class ID required" }, { status: 400 })
    }

    const classItem = await getClassById(classId)

    if (!classItem) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 })
    }

    // Aggregate analytics for all students in class
    // Use LLM analysis for Analytics tab (higher quality, worth the wait)
    const studentActivities = await Promise.all(classItem.studentIds.map(async (studentId) => ({
      student: await getUserById(studentId),
      activity: await getStudentActivity(studentId, classId, false), // false = use LLM analysis
      conversations: await getRAGConversationsByUser(studentId, classId),
    })))

    const totalStudents = studentActivities.length
    const totalChatTime = studentActivities.reduce((sum, s) => sum + s.activity.totalChatTime, 0)
    const totalSessions = studentActivities.reduce((sum, s) => sum + s.activity.totalSessions, 0)
    const averageSentiment =
      studentActivities.length > 0
        ? studentActivities.reduce((sum, s) => sum + s.activity.averageSentiment, 0) / studentActivities.length
        : 0

    // Sentiment distribution based on real student activity data
    const sentimentCounts = { Positive: 0, Neutral: 0, Negative: 0 }
    studentActivities.forEach((s) => {
      const sentiment = s.activity.averageSentiment
      if (sentiment > 0.3) sentimentCounts.Positive++
      else if (sentiment < -0.3) sentimentCounts.Negative++
      else sentimentCounts.Neutral++
    })

    const sentimentDistribution = Object.entries(sentimentCounts).map(([sentiment, count]) => ({
      sentiment,
      count,
    }))

    // Topic distribution - aggregate topics from all students
    const topicCounts = new Map<string, number>()
    studentActivities.forEach((s) => {
      // Ensure topTopics exists and is an array
      const topics = s.activity.topTopics || []
      if (Array.isArray(topics) && topics.length > 0) {
        topics.forEach((topic) => {
          // Handle both object format {topic: string, count: number} and string format
          const topicName = typeof topic === 'string' ? topic : (topic.topic || topic)
          const topicCount = typeof topic === 'object' && topic.count ? topic.count : 1
          topicCounts.set(topicName, (topicCounts.get(topicName) || 0) + topicCount)
        })
      } else {
        console.log(`[Analytics] No topics found for student ${s.student?.name || s.student?.id || 'unknown'}, topTopics:`, topics)
      }
    })

    const topicDistribution = Array.from(topicCounts.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
    
    console.log(`[Analytics] Topic distribution:`, topicDistribution)

    // Activity over time (real data from conversations for last 7 days)
    // Query database directly to get all active sessions for all students in this class
    const activityOverTime = await generateActivityOverTime(classId)

    // Student engagement
    const studentEngagement = studentActivities
      .map((s) => ({
        name: s.student?.name || "Unknown",
        sessions: s.activity.totalSessions,
        minutes: s.activity.totalChatTime,
      }))
      .sort((a, b) => b.sessions - a.sessions)

    const analytics = {
      totalStudents,
      totalChatTime,
      totalSessions,
      averageSentiment,
      sentimentDistribution,
      topicDistribution,
      activityOverTime,
      studentEngagement,
    }

    return NextResponse.json({ analytics })
  } catch (error) {
    console.error("[v0] Get class summary error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Helper function to generate real activity over time data
// Queries database directly to get all active sessions for all students in the class
async function generateActivityOverTime(classId: string): Promise<{ date: string; sessions: number; minutes: number }[]> {
  const { pool } = await import('@/lib/db')
  const client = await pool.connect()
  
  try {
    // Query to get all active conversations for students in this class
    // Join with users table to filter by role='student'
    const result = await client.query(`
      SELECT 
        rc.id,
        rc.created_at,
        rc.message_history,
        rc.user_id
      FROM rag_conversations rc
      INNER JOIN users u ON rc.user_id = u.id
      WHERE rc.class_id = $1
        AND rc.status = 'active'
        AND u.role = 'student'
      ORDER BY rc.created_at DESC
    `, [classId])
    
    const conversations = result.rows
    console.log(`[Analytics] Found ${conversations.length} active student conversations for class ${classId}`)
    
    const activityOverTime = []
    const today = new Date()
    
    // Generate data for last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      // Use local date string (YYYY-MM-DD) for comparison
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const dateStr = `${year}-${month}-${day}` // Local date string
      
      let sessions = 0
      let minutes = 0
      
      // Count sessions and minutes for this date (using local timezone)
      conversations.forEach((conv: any) => {
        if (!conv.created_at) {
          return
        }
        
        // Convert conversation date to local date string for comparison
        const convDateObj = new Date(conv.created_at)
        if (isNaN(convDateObj.getTime())) {
          return
        }
        
        const convYear = convDateObj.getFullYear()
        const convMonth = String(convDateObj.getMonth() + 1).padStart(2, '0')
        const convDay = String(convDateObj.getDate()).padStart(2, '0')
        const convDateStr = `${convYear}-${convMonth}-${convDay}`
        
        // Only count if this conversation matches the current date
        if (convDateStr === dateStr) {
          sessions++
          
          // Calculate minutes from message timestamps
          const messages = conv.message_history || []
          if (messages && Array.isArray(messages) && messages.length >= 2) {
            const userMessages = messages.filter((m: any) => m.role === 'user')
            const assistantMessages = messages.filter((m: any) => m.role === 'assistant')
            
            if (userMessages.length > 0 && assistantMessages.length > 0) {
              try {
                const firstUserTime = new Date(userMessages[0].timestamp).getTime()
                const lastAssistantTime = new Date(assistantMessages[assistantMessages.length - 1].timestamp).getTime()
                if (!isNaN(firstUserTime) && !isNaN(lastAssistantTime)) {
                  const sessionMinutes = (lastAssistantTime - firstUserTime) / (1000 * 60)
                  minutes += Math.max(0, sessionMinutes)
                }
              } catch (e) {
                // Skip if timestamp parsing fails
              }
            }
          }
        }
      })
      
      if (sessions > 0) {
        console.log(`[Analytics] Found ${sessions} active sessions on ${dateStr} for class ${classId}`)
      }
      
      activityOverTime.push({
        date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        sessions,
        minutes: Math.round(minutes)
      })
    }
    
    return activityOverTime
  } finally {
    client.release()
  }
}
