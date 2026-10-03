import { type NextRequest, NextResponse } from "next/server"
import { VectorStoreManager } from "@/lib/vector-store-manager"
import { getClassById } from "@/lib/db-service"

// Get vector store info for a class
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const classId = searchParams.get('classId')

    if (!classId) {
      return NextResponse.json({ error: "Class ID is required" }, { status: 400 })
    }

    const vectorStoreInfo = await VectorStoreManager.getVectorStoreInfo(classId)
    return NextResponse.json({ vectorStore: vectorStoreInfo })
  } catch (error) {
    console.error("Get vector store info error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Create vector store for a class
export async function POST(request: NextRequest) {
  try {
    const { classId, copyFrom } = await request.json()

    if (!classId) {
      return NextResponse.json({ error: "Class ID is required" }, { status: 400 })
    }

    // Check if class exists
    const classData = await getClassById(classId)
    if (!classData) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 })
    }

    // If copyFrom is specified, copy from that vector store
    if (copyFrom) {
      const success = await VectorStoreManager.copyVectorStore(copyFrom, classData.vectorStoreFolder!)
      if (!success) {
        return NextResponse.json({ error: "Failed to copy vector store" }, { status: 500 })
      }
    } else {
      // Create new vector store
      const success = await VectorStoreManager.createVectorStore(classId)
      if (!success) {
        return NextResponse.json({ error: "Failed to create vector store" }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Create vector store error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// List all available vector stores
export async function PUT(request: NextRequest) {
  try {
    const vectorStores = VectorStoreManager.listVectorStores()
    return NextResponse.json({ vectorStores })
  } catch (error) {
    console.error("List vector stores error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
