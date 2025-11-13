import { type NextRequest, NextResponse } from "next/server"
import path from "path"
import fs from "fs"
import { promisify } from "util"
import { getClassById, getUserById, getResourceByFileName } from "@/lib/db-service"

const resourcesDir = path.join(process.cwd(), "resources")

// GET - Download a resource file (with access control)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const classId = searchParams.get("classId")
  const fileName = searchParams.get("fileName")
  const userId = request.headers.get("x-user-id") || searchParams.get("userId")

  if (!classId || !fileName) {
    return NextResponse.json({ error: "Class ID and file name are required" }, { status: 400 })
  }

  if (!userId) {
    return NextResponse.json({ error: "User ID is required" }, { status: 401 })
  }

  try {
    const user = await getUserById(userId)
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const cls = await getClassById(classId)
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 })
    }

    // Security: prevent path traversal
    const safeFileName = path.basename(fileName)

    // Get resource from database
    const resource = await getResourceByFileName(classId, safeFileName)
    if (!resource) {
      return NextResponse.json({ error: "Resource not found" }, { status: 404 })
    }

    // Access control: Faculty who own the class or students enrolled in the class
    if (user.role === "faculty") {
      if (cls.facultyId !== userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
      }
    } else if (user.role === "student") {
      if (!cls.studentIds.includes(userId)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
      }
    } else {
      return NextResponse.json({ error: "Invalid user role" }, { status: 403 })
    }

    const filePath = path.join(resourcesDir, classId, safeFileName)
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    const fileBuffer = await promisify(fs.readFile)(filePath)
    const fileExtension = path.extname(safeFileName).toLowerCase()
    
    // Determine content type
    let contentType = "application/octet-stream"
    if (fileExtension === ".pdf") contentType = "application/pdf"
    else if (fileExtension === ".doc" || fileExtension === ".docx") contentType = "application/msword"
    else if (fileExtension === ".txt") contentType = "text/plain"
    else if (fileExtension === ".jpg" || fileExtension === ".jpeg") contentType = "image/jpeg"
    else if (fileExtension === ".png") contentType = "image/png"

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${safeFileName}"`,
      },
    })
  } catch (error) {
    console.error("Error downloading resource:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
