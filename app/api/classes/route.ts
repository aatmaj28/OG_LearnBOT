import { type NextRequest, NextResponse } from "next/server"
import { getClassesByFaculty, createClass } from "@/lib/mock-db"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const facultyId = searchParams.get("facultyId")

    if (!facultyId) {
      return NextResponse.json({ error: "Faculty ID required" }, { status: 400 })
    }

    const classes = getClassesByFaculty(facultyId)

    return NextResponse.json({ classes })
  } catch (error) {
    console.error("[v0] Get classes error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, description, facultyId } = await request.json()

    if (!name || !facultyId) {
      return NextResponse.json({ error: "Name and faculty ID required" }, { status: 400 })
    }

    const newClass = createClass({
      name,
      description: description || "",
      facultyId,
      studentIds: [],
    })

    return NextResponse.json({ class: newClass })
  } catch (error) {
    console.error("[v0] Create class error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
