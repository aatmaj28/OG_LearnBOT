import { type NextRequest, NextResponse } from "next/server"
import { getClassById, getUserById, getRAGConversationsByUser, getStudentActivity } from "@/lib/db-service"
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

    const activities = await Promise.all(classItem.studentIds.map(async (studentId) => {
      const student = await getUserById(studentId)
      // Pass classId to get class-specific activity data
      // Skip LLM analysis for fast loading (use simple keyword-based sentiment)
      const activity = await getStudentActivity(studentId, classId, true)
      // Get RAG conversations for this student in this class
      const conversations = await getRAGConversationsByUser(studentId, classId)
      
      // Convert RAGConversations to ChatSessions for compatibility
      const sessions = conversations.map((conv: any) => ({
        id: conv.id,
        userId: conv.userId,
        title: conv.title,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        status: conv.status,
        messageCount: conv.messageHistory?.length || 0
      }))

      return {
        student,
        ...activity,
        sessions,
      }
    }))

    return NextResponse.json({ activities })
  } catch (error) {
    console.error("[v0] Get class activity error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
