import { type NextRequest, NextResponse } from "next/server"
import { addStudentToClass } from "@/lib/db-service"
import { ensureDatabaseInitialized } from "@/lib/init-db"

export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseInitialized()
    
    const { classId, studentId } = await request.json()

    if (!classId || !studentId) {
      return NextResponse.json({ error: "Class ID and student ID required" }, { status: 400 })
    }

    const updatedClass = await addStudentToClass(classId, studentId)

    if (!updatedClass) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 })
    }

    return NextResponse.json({ class: updatedClass })
  } catch (error) {
    console.error("[v0] Add student error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
