import { type NextRequest, NextResponse } from "next/server"
import { getClassById } from "@/lib/mock-db"

export async function POST(request: NextRequest) {
  try {
    const { classId, studentId } = await request.json()

    if (!classId || !studentId) {
      return NextResponse.json({ error: "Class ID and student ID required" }, { status: 400 })
    }

    const classItem = getClassById(classId)

    if (!classItem) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 })
    }

    // Remove student from class
    const index = classItem.studentIds.indexOf(studentId)
    if (index > -1) {
      classItem.studentIds.splice(index, 1)
    }

    return NextResponse.json({ class: classItem })
  } catch (error) {
    console.error("[v0] Remove student error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
