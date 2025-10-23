import { type NextRequest, NextResponse } from "next/server"
import { deleteClass } from "@/lib/db-service"
import { ensureDatabaseInitialized } from "@/lib/init-db"

export async function DELETE(request: NextRequest) {
  try {
    await ensureDatabaseInitialized()
    
    const { classId } = await request.json()

    if (!classId) {
      return NextResponse.json({ error: "Class ID required" }, { status: 400 })
    }

    const success = await deleteClass(classId)

    if (!success) {
      return NextResponse.json({ error: "Class not found or could not be deleted" }, { status: 404 })
    }

    return NextResponse.json({ message: "Class deleted successfully" })
  } catch (error) {
    console.error("[v0] Delete class error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
