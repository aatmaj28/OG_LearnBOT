import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { level, message, data } = await request.json()
    
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] [${level}] ${message}`
    
    if (data) {
      console.log(logMessage, data)
    } else {
      console.log(logMessage)
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Log API] Error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}

