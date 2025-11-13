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
      return NextResponse.json({ files: [] })
    }

    const basePath = VectorStoreManager.getVectorStorePathByFolder(vectorStoreFolder)
    const pdfDir = path.join(basePath, "source_pdfs")
    if (!fs.existsSync(pdfDir)) {
      return NextResponse.json({ files: [] })
    }
    const files = fs.readdirSync(pdfDir).filter(f => f.toLowerCase().endsWith(".pdf"))
    return NextResponse.json({ files })
  } catch (error) {
    console.error("Corpus files list error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const classId = searchParams.get("classId")
    const filename = searchParams.get("filename")
    const materialType = searchParams.get("materialType") || "class_material"
    const isSyllabus = materialType === "syllabus"
    
    if (!classId || !filename) {
      return NextResponse.json({ error: "Class ID and filename are required" }, { status: 400 })
    }

    const cls = await getClassById(classId)
    const vectorStoreFolder = isSyllabus ? cls?.syllabusVectorStoreFolder : cls?.vectorStoreFolder
    
    if (!vectorStoreFolder) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 })
    }

    const basePath = VectorStoreManager.getVectorStorePathByFolder(vectorStoreFolder)
    const pdfDir = path.join(basePath, "source_pdfs")
    const filePath = path.join(pdfDir, filename)
    
    // Security: ensure file is within the PDF directory
    if (!filePath.startsWith(pdfDir)) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 })
    }
    
    if (fs.existsSync(filePath)) {
      // Delete the PDF file
      fs.unlinkSync(filePath)
      console.log(`[Corpus Delete] Deleted PDF: ${filename}`)
      
      // Now rebuild the index without this PDF's chunks
      const indexPath = path.join(basePath, "faiss_index.bin")
      const metaPath = path.join(basePath, "metadata.pkl")
      
      if (fs.existsSync(indexPath) && fs.existsSync(metaPath)) {
        try {
          // Read existing metadata to filter out chunks from deleted file
          const { spawn } = require('child_process')
          const filterScript = `
import pickle
import faiss
import numpy as np
import sys
import json
import os

meta_path = sys.argv[1]
index_path = sys.argv[2]
deleted_file = sys.argv[3]
base_path = os.path.dirname(meta_path)

# Load existing data
with open(meta_path, 'rb') as f:
    old_meta = pickle.load(f)

old_index = faiss.read_index(index_path)

# Filter out chunks from deleted file
keep_indices = []
new_meta = []
for i, meta in enumerate(old_meta):
    if meta.get('source_file') != deleted_file:
        keep_indices.append(i)
        new_meta.append(meta)

if len(new_meta) == 0:
    # No chunks left, delete index files
    os.remove(index_path)
    os.remove(meta_path)
    # Also delete metadata.json if it exists
    meta_json_path = os.path.join(base_path, "metadata.json")
    if os.path.exists(meta_json_path):
        os.remove(meta_json_path)
    print(f'{{"success": true, "chunks_removed": {len(old_meta)}, "chunks_remaining": 0}}')
else:
    # Reconstruct index with remaining chunks
    vectors = np.zeros((len(keep_indices), old_index.d), dtype='float32')
    for new_idx, old_idx in enumerate(keep_indices):
        vectors[new_idx] = old_index.reconstruct(int(old_idx))
    
    # Create new index using L2 (matches indexing script which uses IndexFlatL2)
    new_index = faiss.IndexFlatL2(old_index.d)
    new_index.add(vectors)
    
    # Save updated pickle metadata
    faiss.write_index(new_index, index_path)
    with open(meta_path, 'wb') as f:
        pickle.dump(new_meta, f)
    
    # Also update metadata.json so stats endpoint shows correct count
    meta_json_path = os.path.join(base_path, "metadata.json")
    with open(meta_json_path, 'w', encoding='utf-8') as f:
        json.dump(new_meta, f, ensure_ascii=False, indent=2)
    
    print(f'{{"success": true, "chunks_removed": {len(old_meta) - len(new_meta)}, "chunks_remaining": {len(new_meta)}}}')
`
          
          const tmpScript = path.join(basePath, "temp_filter.py")
          fs.writeFileSync(tmpScript, filterScript)
          
          const py = spawn("python", [tmpScript, metaPath, indexPath, filename])
          
          let stdout = ""
          let stderr = ""
          py.stdout.on("data", (d: Buffer) => (stdout += d.toString()))
          py.stderr.on("data", (d: Buffer) => (stderr += d.toString()))
          
          await new Promise<void>((resolve) => {
            py.on("close", () => {
              try { fs.unlinkSync(tmpScript) } catch {}
              console.log("[Corpus Delete] Filter output:", stdout)
              if (stderr) console.error("[Corpus Delete] Filter stderr:", stderr)
              resolve()
            })
          })
          
          return NextResponse.json({ 
            success: true, 
            message: "PDF and its embeddings removed from index."
          })
        } catch (e) {
          console.error("[Corpus Delete] Error filtering index:", e)
          // Fallback: delete index for rebuild
          if (fs.existsSync(indexPath)) fs.unlinkSync(indexPath)
          if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath)
          // Also delete metadata.json
          const metaJsonPath = path.join(basePath, "metadata.json")
          if (fs.existsSync(metaJsonPath)) fs.unlinkSync(metaJsonPath)
          return NextResponse.json({ 
            success: true, 
            message: "PDF deleted. Index cleared. Please click 'Start Index' to rebuild." 
          })
        }
      } else {
        // No index exists yet, just confirm deletion
        return NextResponse.json({ 
          success: true, 
          message: "PDF deleted successfully."
        })
      }
    } else {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }
  } catch (error) {
    console.error("Corpus file delete error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}



