import { type NextRequest, NextResponse } from "next/server"
import path from "path"
import fs from "fs"
import { getClassById } from "@/lib/db-service"
import { VectorStoreManager } from "@/lib/vector-store-manager"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const classId = searchParams.get("classId")
    if (!classId) {
      return NextResponse.json({ error: "Class ID is required" }, { status: 400 })
    }

    const cls = await getClassById(classId)
    if (!cls?.vectorStoreFolder) {
      return NextResponse.json({ pdfCount: 0, chunkCount: 0 })
    }

    const basePath = VectorStoreManager.getVectorStorePathByFolder(cls.vectorStoreFolder)
    const pdfDir = path.join(basePath, "source_pdfs")
    const metaPath = path.join(basePath, "metadata.pkl")
    
    let pdfCount = 0
    let chunkCount = 0
    
    // Count PDFs
    if (fs.existsSync(pdfDir)) {
      const files = fs.readdirSync(pdfDir).filter(f => f.toLowerCase().endsWith(".pdf"))
      pdfCount = files.length
    }
    
    // Count chunks from metadata
    if (fs.existsSync(metaPath)) {
      try {
        // Read file size as proxy for chunk count (each entry ~200-500 bytes)
        const stats = fs.statSync(metaPath)
        // Rough estimate: 300 bytes per chunk average
        chunkCount = Math.floor(stats.size / 300)
        
        // Better: parse if we can
        // For now, we'll use the spawn python approach only when building index
        // This is just a rough estimate for display
      } catch (e) {
        console.error("Error reading metadata:", e)
      }
    }
    
    return NextResponse.json({ pdfCount, chunkCount })
  } catch (error) {
    console.error("Corpus stats error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

