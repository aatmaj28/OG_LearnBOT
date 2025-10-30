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

    // Topic distribution
    const topicCounts = new Map<string, number>()
    studentActivities.forEach((s) => {
      s.activity.topTopics.forEach((topic) => {
        topicCounts.set(topic.topic, (topicCounts.get(topic.topic) || 0) + topic.count)
      })
    })

    const topicDistribution = Array.from(topicCounts.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Activity over time (real data from conversations for last 7 days)
    const activityOverTime = await generateActivityOverTime(studentActivities)

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
async function generateActivityOverTime(studentActivities: any[]): Promise<{ date: string; sessions: number; minutes: number }[]> {
  const activityOverTime = []
  const today = new Date()
  
  // Generate data for last 7 days
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0] // YYYY-MM-DD format
    
    let sessions = 0
    let minutes = 0
    
    // Count sessions and minutes for this date
    studentActivities.forEach((s) => {
      s.conversations.forEach((conv: any) => {
        const convDate = new Date(conv.createdAt).toISOString().split('T')[0]
        if (convDate === dateStr) {
          sessions++
          
          // Calculate minutes from message timestamps
          const messages = conv.messageHistory || []
          if (messages.length >= 2) {
            const userMessages = messages.filter((m: any) => m.role === 'user')
            const assistantMessages = messages.filter((m: any) => m.role === 'assistant')
            
            if (userMessages.length > 0 && assistantMessages.length > 0) {
              const firstUserTime = new Date(userMessages[0].timestamp).getTime()
              const lastAssistantTime = new Date(assistantMessages[assistantMessages.length - 1].timestamp).getTime()
              const sessionMinutes = (lastAssistantTime - firstUserTime) / (1000 * 60)
              minutes += Math.max(0, sessionMinutes)
            }
          }
        }
      })
    })
    
    activityOverTime.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      sessions,
      minutes: Math.round(minutes)
    })
  }
  
  return activityOverTime
}
