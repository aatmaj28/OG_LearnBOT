import { type NextRequest, NextResponse } from "next/server";

const FLASK_API_URL = (process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://localhost:5000').replace(/\/$/, '')

/**
 * Proxy assignment downloads through Flask backend.
 * Files are stored on the Flask server filesystem, so we proxy the request
 * rather than reading from the local filesystem (which may be a different directory).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("classId");
  const assignmentId = searchParams.get("assignmentId");

  if (!classId || !assignmentId) {
    return NextResponse.json(
      { error: "Class ID and assignment ID are required" },
      { status: 400 }
    );
  }

  try {
    // Proxy to Flask backend
    const flaskUrl = `${FLASK_API_URL}/api/classes/assignments/download?classId=${classId}&assignmentId=${assignmentId}`
    
    const response = await fetch(flaskUrl)
    
    if (!response.ok) {
      // Forward Flask error response
      const contentType = response.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        const errorData = await response.json()
        return NextResponse.json(errorData, { status: response.status })
      }
      return NextResponse.json({ error: "Failed to download assignment" }, { status: response.status })
    }

    // Forward the file response
    const fileBuffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'application/pdf'
    const contentDisposition = response.headers.get('content-disposition') || `attachment; filename="assignment.pdf"`

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition,
      },
    });
  } catch (error) {
    console.error("Failed to download assignment:", error);
    return NextResponse.json({ error: "Failed to download assignment" }, { status: 500 });
  }
}
