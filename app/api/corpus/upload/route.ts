import { type NextRequest, NextResponse } from "next/server"
import path from "path"
import fs from "fs"
import { getClassById, updateClassVectorStoreFolder, generateVectorStoreFolderName } from "@/lib/db-service"
import { VectorStoreManager } from "@/lib/vector-store-manager"

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const classId = searchParams.get("classId")
    console.log("[Corpus Upload] Class ID:", classId)
    
    if (!classId) {
      return NextResponse.json({ error: "Class ID is required" }, { status: 400 })
    }

    let cls = await getClassById(classId)
    console.log("[Corpus Upload] Class data:", cls)
    
    // If class doesn't have a vector store folder, create one
    if (!cls?.vectorStoreFolder) {
      console.log("[Corpus Upload] Class has no vectorStoreFolder, creating one...")
      const vectorStoreFolder = generateVectorStoreFolderName(cls?.name || `class_${classId}`)
      cls = await updateClassVectorStoreFolder(classId, vectorStoreFolder)
      console.log("[Corpus Upload] Updated class with vectorStoreFolder:", vectorStoreFolder)
    }
    
    if (!cls?.vectorStoreFolder) {
      console.error("[Corpus Upload] Failed to create vectorStoreFolder for class:", cls)
      return NextResponse.json({ 
        error: "Failed to configure class vector store" 
      }, { status: 500 })
    }

    const form = await request.formData()
    const files = form.getAll("files") as File[]
    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 })
    }

    const storePath = VectorStoreManager.getVectorStorePathByFolder(cls.vectorStoreFolder)
    const pdfDir = path.join(storePath, "source_pdfs")
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true })
    }

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")
      const dest = path.join(pdfDir, safeName)
      fs.writeFileSync(dest, buffer)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Corpus upload error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}



