import { type NextRequest, NextResponse } from "next/server"
import { getClassById, getUserById, getStudentActivity, getChatAnalyticsByUser } from "@/lib/mock-db"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const classId = searchParams.get("classId")

    if (!classId) {
      return NextResponse.json({ error: "Class ID required" }, { status: 400 })
    }

    const classItem = getClassById(classId)

    if (!classItem) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 })
    }

    // Aggregate analytics for all students in class
    const studentActivities = classItem.studentIds.map((studentId) => ({
      student: getUserById(studentId),
      activity: getStudentActivity(studentId),
      analytics: getChatAnalyticsByUser(studentId),
    }))

    const totalStudents = studentActivities.length
    const totalChatTime = studentActivities.reduce((sum, s) => sum + s.activity.totalChatTime, 0)
    const totalSessions = studentActivities.reduce((sum, s) => sum + s.activity.totalSessions, 0)
    const averageSentiment =
      studentActivities.length > 0
        ? studentActivities.reduce((sum, s) => sum + s.activity.averageSentiment, 0) / studentActivities.length
        : 0

    // Sentiment distribution
    const sentimentCounts = { Positive: 0, Neutral: 0, Negative: 0 }
    studentActivities.forEach((s) => {
      s.analytics.forEach((a) => {
        if (a.sentiment === "positive") sentimentCounts.Positive++
        else if (a.sentiment === "negative") sentimentCounts.Negative++
        else sentimentCounts.Neutral++
      })
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

    // Activity over time (mock data for last 7 days)
    const activityOverTime = Array.from({ length: 7 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - (6 - i))
      return {
        date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        sessions: Math.floor(Math.random() * 10) + 1,
        minutes: Math.floor(Math.random() * 100) + 20,
      }
    })

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
