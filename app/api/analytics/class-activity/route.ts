import { type NextRequest, NextResponse } from "next/server"
import { getClassById, getUserById, getChatSessionsByUser, getStudentActivity } from "@/lib/mock-db"

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

    const activities = classItem.studentIds.map((studentId) => {
      const student = getUserById(studentId)
      const activity = getStudentActivity(studentId)
      const sessions = getChatSessionsByUser(studentId)

      return {
        student,
        ...activity,
        sessions,
      }
    })

    return NextResponse.json({ activities })
  } catch (error) {
    console.error("[v0] Get class activity error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
