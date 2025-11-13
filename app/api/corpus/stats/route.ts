import { type NextRequest, NextResponse } from "next/server"
import path from "path"
import fs from "fs"
import { getClassById } from "@/lib/db-service"
import { VectorStoreManager } from "@/lib/vector-store-manager"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const classId = searchParams.get("classId")
    const materialType = searchParams.get("materialType") || "class_material"
    const isSyllabus = materialType === "syllabus"
    
    if (!classId) {
      return NextResponse.json({ error: "Class ID is required" }, { status: 400 })
    }

    const cls = await getClassById(classId)
    const vectorStoreFolder = isSyllabus ? cls?.syllabusVectorStoreFolder : cls?.vectorStoreFolder
    
    if (!vectorStoreFolder) {
      return NextResponse.json({ pdfCount: 0, chunkCount: 0 })
    }

    const basePath = VectorStoreManager.getVectorStorePathByFolder(vectorStoreFolder)
    const pdfDir = path.join(basePath, "source_pdfs")
    const metaPath = path.join(basePath, "metadata.pkl")
    
    let pdfCount = 0
    let chunkCount = 0
    
    // Count PDFs
    if (fs.existsSync(pdfDir)) {
      const files = fs.readdirSync(pdfDir).filter(f => f.toLowerCase().endsWith(".pdf"))
      pdfCount = files.length
    }
    
    // Count chunks from metadata - read actual count from metadata.json
    const metaJsonPath = path.join(basePath, "metadata.json")
    if (fs.existsSync(metaJsonPath)) {
      try {
        const metadata = JSON.parse(fs.readFileSync(metaJsonPath, 'utf-8'))
        chunkCount = Array.isArray(metadata) ? metadata.length : 0
      } catch (e) {
        console.error("Error reading metadata.json:", e)
        // Fallback: try to read from config.json
        const configPath = path.join(basePath, "config.json")
        if (fs.existsSync(configPath)) {
          try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
            chunkCount = config.total_chunks || 0
          } catch (e2) {
            console.error("Error reading config.json:", e2)
          }
        }
      }
    }
    
    return NextResponse.json({ pdfCount, chunkCount })
  } catch (error) {
    console.error("Corpus stats error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

