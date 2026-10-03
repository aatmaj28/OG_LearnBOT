import { type NextRequest, NextResponse } from "next/server"
import { getClassById, getUserById, getRAGConversationsByUser, getStudentActivity } from "@/lib/db-service"
import { ensureDatabaseInitialized } from "@/lib/init-db"
import { getRequestingUser } from "@/lib/api-utils"

export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseInitialized()

    // Get requesting user context for PII masking (faculty should see unmasked data)
    const requestingUser = await getRequestingUser(request)

    const { searchParams } = new URL(request.url)
    const classId = searchParams.get("classId")

    if (!classId) {
      return NextResponse.json({ error: "Class ID required" }, { status: 400 })
    }

    const classItem = await getClassById(classId)

    if (!classItem) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 })
    }

    // Use ENABLE_LLM_ANALYTICS to determine analysis method
    // true = LLM-based (Blackwell), false = Enhanced keyword-based (n-grams)
    // Always pass skipLLMAnalysis=false so analyzeLatestConversation() can respect ENABLE_LLM_ANALYTICS
    const activities = await Promise.all(classItem.studentIds.map(async (studentId) => {
      // Pass faculty context so PII masking returns unmasked data for faculty
      const student = await getUserById(
        studentId,
        requestingUser?.id,
        requestingUser?.role || null
      )
      // Pass classId to get class-specific activity data
      // skipLLMAnalysis=false allows analyzeLatestConversation() to use ENABLE_LLM_ANALYTICS
      // This means: true = LLM (Blackwell), false = Enhanced keyword-based (n-grams)
      const activity = await getStudentActivity(studentId, classId, false)
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

