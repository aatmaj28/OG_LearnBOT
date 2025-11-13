import { type NextRequest, NextResponse } from "next/server"
import path from "path"
import fs from "fs"
import { promisify } from "util"
import { getClassById, getUserById, getResourcesByClass, createResource, getResourceByFileName, deleteResourceById } from "@/lib/db-service"

const resourcesDir = path.join(process.cwd(), "resources")

const ensureDirExists = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

// GET - List resources for a class (with access control)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const classId = searchParams.get("classId")
  const userId = request.headers.get("x-user-id") || searchParams.get("userId")

  if (!classId) {
    return NextResponse.json({ error: "Class ID is required" }, { status: 400 })
  }

  if (!userId) {
    return NextResponse.json({ error: "User ID is required" }, { status: 401 })
  }

  try {
    // Get user to check role
    const user = await getUserById(userId)
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Verify class exists
    const cls = await getClassById(classId)
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 })
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

    // Get resources from database
    const resources = await getResourcesByClass(classId)

    // Format resources for response
    const formattedResources = resources.map(resource => ({
      name: resource.fileName,
      size: resource.fileSize,
      uploadedAt: resource.uploadedAt
    }))

    return NextResponse.json({ resources: formattedResources })
  } catch (error) {
    console.error("Error listing resources:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST - Upload resources for a class (only faculty can upload)
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const classId = form.get("classId") as string
    const userId = request.headers.get("x-user-id") || form.get("userId") as string

    if (!classId) {
      return NextResponse.json({ error: "Class ID is required" }, { status: 400 })
    }

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 401 })
    }

    const user = await getUserById(userId)
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (user.role !== "faculty") {
      return NextResponse.json({ error: "Only faculty can upload resources" }, { status: 403 })
    }

    const cls = await getClassById(classId)
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 })
    }

    if (cls.facultyId !== userId) {
      return NextResponse.json({ error: "Unauthorized: You can only upload resources for your own classes" }, { status: 403 })
    }

    const files = form.getAll("files") as File[]
    
    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 })
    }

    // Create resources directory if it doesn't exist
    const classResourcesDir = path.join(resourcesDir, classId)
    ensureDirExists(classResourcesDir)

    const uploadedFiles = []
    for (const file of files) {
      // Only allow PDF files
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        continue
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")
      const dest = path.join(classResourcesDir, safeName)

      // Check if file already exists in database
      const existingResource = await getResourceByFileName(classId, safeName)
      if (existingResource) {
        // File already exists, skip
        continue
      }

      // Save file to filesystem
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      await promisify(fs.writeFile)(dest, buffer)

      // Save resource metadata to database
      const resource = await createResource({
        classId,
        facultyId: userId,
        fileName: safeName,
        fileSize: file.size
      })

      uploadedFiles.push({
        name: resource.fileName,
        size: resource.fileSize,
        uploadedAt: resource.uploadedAt
      })
    }

    if (uploadedFiles.length === 0) {
      return NextResponse.json({ error: "No valid PDF files to upload" }, { status: 400 })
    }

    return NextResponse.json({ success: true, files: uploadedFiles })
  } catch (error) {
    console.error("Error uploading resources:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE - Delete a resource file (only faculty who uploaded it can delete)
export async function DELETE(request: NextRequest) {
  try {
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

    const user = await getUserById(userId)
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (user.role !== "faculty") {
      return NextResponse.json({ error: "Only faculty can delete resources" }, { status: 403 })
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

    // Check if user owns the class or uploaded the resource
    if (cls.facultyId !== userId && resource.facultyId !== userId) {
      return NextResponse.json({ error: "Unauthorized: You can only delete resources you uploaded" }, { status: 403 })
    }

    // Delete file from filesystem
    const filePath = path.join(resourcesDir, classId, safeFileName)
    if (fs.existsSync(filePath)) {
      await promisify(fs.unlink)(filePath)
    }

    // Delete from database
    await deleteResourceById(resource.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting resource:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
