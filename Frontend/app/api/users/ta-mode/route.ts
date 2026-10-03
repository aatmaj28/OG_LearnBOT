import { type NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { ensureDatabaseInitialized } from "@/lib/init-db"

export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseInitialized()
    
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")
    
    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }
    
    const client = await pool.connect()
    try {
      const result = await client.query(
        'SELECT ta_mode FROM users WHERE id = $1',
        [userId]
      )
      
      if (result.rows.length === 0) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }
      
      const taMode = result.rows[0].ta_mode || 'normal'
      return NextResponse.json({ taMode })
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error("[TA Mode] Error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to get TA mode" },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    await ensureDatabaseInitialized()
    
    const { userId, taMode } = await request.json()
    
    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }
    
    if (!taMode || !['lenient', 'normal', 'strict'].includes(taMode)) {
      return NextResponse.json(
        { error: "Invalid TA mode. Must be 'lenient', 'normal', or 'strict'" },
        { status: 400 }
      )
    }
    
    const client = await pool.connect()
    try {
      // Verify user exists and is faculty
      const userResult = await client.query(
        'SELECT role FROM users WHERE id = $1',
        [userId]
      )
      
      if (userResult.rows.length === 0) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }
      
      if (userResult.rows[0].role !== 'faculty') {
        return NextResponse.json(
          { error: "Only faculty can set TA mode" },
          { status: 403 }
        )
      }
      
      // Update TA mode
      await client.query(
        'UPDATE users SET ta_mode = $1 WHERE id = $2',
        [taMode, userId]
      )
      
      return NextResponse.json({ success: true, taMode })
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error("[TA Mode] Error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to update TA mode" },
      { status: 500 }
    )
  }
}

