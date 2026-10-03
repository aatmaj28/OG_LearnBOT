import { type NextRequest, NextResponse } from "next/server"

const FLASK_API_URL = (process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://localhost:5000').replace(/\/$/, '')

/**
 * Proxy resource downloads through Flask backend.
 * Files are stored on the Flask server filesystem, so we proxy the request
 * rather than reading from the local filesystem (which may be a different directory).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const classId = searchParams.get("classId")
  const fileName = searchParams.get("fileName")

  if (!classId || !fileName) {
    return NextResponse.json({ error: "Class ID and file name are required" }, { status: 400 })
  }

  try {
    // Proxy to Flask backend
    const flaskUrl = `${FLASK_API_URL}/api/classes/resources/download?classId=${classId}&fileName=${encodeURIComponent(fileName)}`
    
    const response = await fetch(flaskUrl)
    
    if (!response.ok) {
      // Forward Flask error response
      const contentType = response.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        const errorData = await response.json()
        return NextResponse.json(errorData, { status: response.status })
      }
      return NextResponse.json({ error: "File not found" }, { status: response.status })
    }

    // Forward the file response
    const fileBuffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const contentDisposition = response.headers.get('content-disposition') || `attachment; filename="${fileName}"`

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition,
      },
    })
  } catch (error) {
    console.error("Error downloading resource:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
