import { type NextRequest, NextResponse } from "next/server"
import { 
  getRAGConversationsByUser, 
  createRAGConversation, 
  getRAGConversationById,
  archiveRAGConversation,
  updateRAGConversation
} from "@/lib/db-service"

// Get user's conversations
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const classId = searchParams.get('classId')
    const chatType = searchParams.get('chatType') as 'class_material' | 'syllabus' | null

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    const conversations = await getRAGConversationsByUser(userId, classId || undefined, chatType || undefined)
    return NextResponse.json({ conversations })
  } catch (error) {
    console.error("Get conversations error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Create new conversation
export async function POST(request: NextRequest) {
  try {
    const { userId, title, classId, chatType } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    const conversation = await createRAGConversation(userId, title, classId, chatType || 'class_material')
    console.log("Created conversation:", conversation)
    return NextResponse.json({ conversation })
  } catch (error) {
    console.error("Create conversation error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Update conversation (archive, update title, etc.)
export async function PUT(request: NextRequest) {
  try {
    const { conversationId, updates } = await request.json()

    if (!conversationId) {
      return NextResponse.json({ error: "Conversation ID is required" }, { status: 400 })
    }

    const conversation = updateRAGConversation(conversationId, updates)
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
    }

    return NextResponse.json({ conversation })
  } catch (error) {
    console.error("Update conversation error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Archive conversation
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversationId')

    if (!conversationId) {
      return NextResponse.json({ error: "Conversation ID is required" }, { status: 400 })
    }

    archiveRAGConversation(conversationId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Archive conversation error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
