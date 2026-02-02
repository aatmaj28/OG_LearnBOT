import { type NextRequest, NextResponse } from "next/server"
import path from "path"
import fs from "fs"
import { spawn } from "child_process"
import { getClassById, getCorpusFilesByClass } from "@/lib/db-service"
import { VectorStoreManager } from "@/lib/vector-store-manager"
import { pool } from "@/lib/db"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const classId = searchParams.get("classId")
    const materialType = searchParams.get("materialType") || "class_material"
    const studentId = searchParams.get("studentId") // Optional: check enrollment if provided
    const isSyllabus = materialType === "syllabus"
    
    if (!classId) {
      return NextResponse.json({ error: "Class ID is required" }, { status: 400 })
    }

    // Check student enrollment if studentId is provided
    if (studentId) {
      const client = await pool.connect()
      try {
        const enrollmentResult = await client.query(
          'SELECT 1 FROM class_students WHERE class_id = $1 AND student_id = $2',
          [classId, studentId]
        )
        if (enrollmentResult.rows.length === 0) {
          return NextResponse.json({ 
            pdfCount: 0, 
            chunkCount: 0, 
            isEnrolled: false,
            hasIndexedFiles: false,
            canChat: false 
          })
        }
      } finally {
        client.release()
      }
    }

    // Check database for indexed files (more accurate than file system)
    const corpusFiles = await getCorpusFilesByClass(classId, materialType as 'class_material' | 'syllabus')
    const indexedFiles = corpusFiles.filter(file => file.isIndexed)
    const hasIndexedFiles = indexedFiles.length > 0
    const totalChunks = indexedFiles.reduce((sum, file) => sum + (file.chunkCount || 0), 0)

    // If we have indexed files in the database, return that (most accurate)
    if (hasIndexedFiles) {
      return NextResponse.json({ 
        pdfCount: indexedFiles.length, 
        chunkCount: totalChunks,
        isEnrolled: studentId ? true : undefined,
        hasIndexedFiles: true,
        canChat: true
      })
    }

    // Fallback to file system check if no database records found
    const cls = await getClassById(classId)
    const vectorStoreFolder = isSyllabus ? cls?.syllabusVectorStoreFolder : cls?.vectorStoreFolder
    
    if (!vectorStoreFolder) {
      return NextResponse.json({ 
        pdfCount: 0, 
        chunkCount: 0,
        isEnrolled: studentId ? true : undefined,
        hasIndexedFiles: false,
        canChat: false
      })
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
    
    // Count chunks - query Qdrant directly for accurate count
    const configPath = path.join(basePath, "config.json")
    let collectionName = vectorStoreFolder // Default to folder name
    
    // Try to get collection name from config.json
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        if (config.collection_name) {
          collectionName = config.collection_name
        }
        // Use config.json as fallback if Qdrant query fails
        chunkCount = config.total_chunks || 0
      } catch (e) {
        console.error("Error reading config.json:", e)
      }
    }
    
    // Query Qdrant directly for accurate count
    try {
      const pythonScript = path.join(process.cwd(), 'lib', 'get-qdrant-stats.py')
      if (fs.existsSync(pythonScript)) {
        // Try venv Python first, then system Python
        const venvPython = path.join(process.cwd(), 'venv', 'Scripts', 'python.exe')
        const pythonExec = fs.existsSync(venvPython) ? venvPython : 'python'
        
        const result = await new Promise<string>((resolve, reject) => {
          const pythonProcess = spawn(pythonExec, [pythonScript, collectionName])
          let stdoutData = ''
          let stderrData = ''
          
          pythonProcess.stdout.on('data', (data: Buffer) => {
            stdoutData += data.toString()
          })
          
          pythonProcess.stderr.on('data', (data: Buffer) => {
            stderrData += data.toString()
          })
          
          pythonProcess.on('close', (code: number) => {
            if (code === 0) {
              resolve(stdoutData.trim())
            } else {
              reject(new Error(`Python script exited with code ${code}: ${stderrData}`))
            }
          })
          
          pythonProcess.on('error', (err: Error) => {
            reject(err)
          })
        })
        
        const qdrantStats = JSON.parse(result)
        if (qdrantStats.success && qdrantStats.chunkCount !== undefined) {
          chunkCount = qdrantStats.chunkCount
        }
      }
    } catch (e) {
      console.error("Error querying Qdrant for stats (using fallback):", e)
      // Fallback: try metadata.json if Qdrant query failed
      const metaJsonPath = path.join(basePath, "metadata.json")
      if (fs.existsSync(metaJsonPath)) {
        try {
          const metadata = JSON.parse(fs.readFileSync(metaJsonPath, 'utf-8'))
          chunkCount = Array.isArray(metadata) ? metadata.length : 0
        } catch (e2) {
          console.error("Error reading metadata.json:", e2)
        }
      }
    }
    
    return NextResponse.json({ 
      pdfCount, 
      chunkCount,
      isEnrolled: studentId ? true : undefined,
      hasIndexedFiles: chunkCount > 0,
      canChat: chunkCount > 0
    })
  } catch (error) {
    console.error("Corpus stats error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

