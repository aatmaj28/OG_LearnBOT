import { type NextRequest, NextResponse } from "next/server"
import { addStudentToClass } from "@/lib/mock-db"

export async function POST(request: NextRequest) {
  try {
    const { classId, studentId } = await request.json()

    if (!classId || !studentId) {
      return NextResponse.json({ error: "Class ID and student ID required" }, { status: 400 })
    }

    const updatedClass = addStudentToClass(classId, studentId)

    if (!updatedClass) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 })
    }

    return NextResponse.json({ class: updatedClass })
  } catch (error) {
    console.error("[v0] Add student error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
