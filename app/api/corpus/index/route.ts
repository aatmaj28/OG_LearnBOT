import { type NextRequest, NextResponse } from "next/server"
import path from "path"
import fs from "fs"
import { spawn } from "child_process"
import { getClassById, markCorpusFileAsIndexed, getCorpusFilesByClass } from "@/lib/db-service"
import { VectorStoreManager } from "@/lib/vector-store-manager"
import { ragService } from "@/lib/rag-service"

export async function POST(request: NextRequest) {
  try {
    const { classId, materialType } = await request.json()
    const isSyllabus = materialType === "syllabus"
    console.log('[Corpus Index] Starting indexing for class:', classId, 'Material type:', materialType)
    
    if (!classId) {
      return NextResponse.json({ error: "Class ID is required" }, { status: 400 })
    }

    const cls = await getClassById(classId)
    const vectorStoreFolder = isSyllabus ? cls?.syllabusVectorStoreFolder : cls?.vectorStoreFolder
    
    if (!vectorStoreFolder) {
      return NextResponse.json({ 
        error: `Class ${materialType || 'class_material'} vector store not configured` 
      }, { status: 400 })
    }

    const storePath = VectorStoreManager.getVectorStorePathByFolder(vectorStoreFolder)
    const pdfDir = path.join(storePath, "source_pdfs")
    
    if (!fs.existsSync(pdfDir)) {
      return NextResponse.json({ 
        error: "No PDFs directory found. Upload PDFs first." 
      }, { status: 400 })
    }

    // Get all PDF files
    const pdfFiles = fs.readdirSync(pdfDir)
      .filter(f => f.toLowerCase().endsWith('.pdf'))
      .map(f => path.join(pdfDir, f))
    
    if (pdfFiles.length === 0) {
      return NextResponse.json({ 
        error: "No PDF files found to index" 
      }, { status: 400 })
    }

    console.log(`[Corpus Index] Found ${pdfFiles.length} PDFs to index`)

    // Check if index already exists (for incremental indexing)
    // Check for ChromaDB collection via config.json (which indicates indexing was done)
    const configPath = path.join(storePath, "config.json")
    const hasExistingIndex = fs.existsSync(configPath)
    
    console.log(`[Corpus Index] Existing index found: ${hasExistingIndex}`)

    // Use LlamaIndex-based indexing service
    const indexingServicePath = path.join(process.cwd(), 'lib', 'llamaindex-indexing-service.py')
    
    // Prepare arguments for the indexing service
    const args = [
      indexingServicePath,
      storePath.replace(/\\/g, '/'),  // Normalize path separators
      isSyllabus ? 'true' : 'false',
      classId || '',
      cls?.name || '',
      ...pdfFiles.map(p => p.replace(/\\/g, '/'))  // Normalize path separators
    ]

    console.log('[Corpus Index] Using LlamaIndex indexing service')
    console.log('[Corpus Index] Service path:', indexingServicePath)

    // Execute LlamaIndex indexing service
    const result = await new Promise<{ success: boolean; chunks?: number; pdfs?: number; newChunks?: number; chunks_per_file?: Record<string, number>; error?: string }>((resolve) => {
      const pythonProcess = spawn('python', args)
      let stdoutData = ''
      let stderrData = ''

      pythonProcess.stdout.on('data', (data) => {
        stdoutData += data.toString()
      })

      pythonProcess.stderr.on('data', (data) => {
        const msg = data.toString()
        stderrData += msg
        console.log('[Corpus Index]', msg.trim())
      })

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const lastLine = stdoutData.trim().split('\n').pop()
            const result = JSON.parse(lastLine || '{}')
            console.log('[Corpus Index] Python result:', JSON.stringify(result))
            resolve({ 
              success: true, 
              chunks: result.chunks,
              pdfs: result.pdfs,
              newChunks: result.new_chunks,
              chunks_per_file: result.chunks_per_file || {} // Include chunks_per_file
            })
          } catch (e) {
            console.error('[Corpus Index] Failed to parse result:', e)
            resolve({ success: false, error: 'Failed to parse indexing result' })
          }
        } else {
          console.error('[Corpus Index] Python process failed with code:', code)
          resolve({ success: false, error: stderrData || 'Indexing failed' })
        }
      })

      pythonProcess.on('error', (err) => {
        console.error('[Corpus Index] Python process error:', err)
        resolve({ success: false, error: err.message })
      })
    })

    if (result.success) {
      // Use stats directly from Python script output (most accurate and immediate)
      const pdfCount = result.pdfs || 0
      const chunkCount = result.chunks || 0
      const chunksPerFile = result.chunks_per_file || {} // Exact counts per file from Qdrant
      
      // Mark all PDFs as indexed in database with EXACT chunk counts
      // Get list of PDF files that were indexed
      const pdfFileNames = pdfFiles.map(p => path.basename(p))
      
      for (const fileName of pdfFileNames) {
        try {
          // Use exact count from Qdrant, or 0 if not found
          const exactChunkCount = chunksPerFile[fileName] || 0
          
          console.log(`[Corpus Index] Updating database for ${fileName}: chunksPerFile =`, chunksPerFile, `exactChunkCount =`, exactChunkCount)
          
          await markCorpusFileAsIndexed(
            classId,
            fileName,
            materialType as 'class_material' | 'syllabus',
            exactChunkCount
          )
          console.log(`[Corpus Index] ✅ Marked ${fileName} as indexed with ${exactChunkCount} chunks (exact count)`)
        } catch (error) {
          console.error(`[Corpus Index] ❌ Failed to mark ${fileName} as indexed:`, error)
          // Continue - non-critical
        }
      }
      
      // Return response immediately, reload vector store asynchronously in background (fire-and-forget)
      ragService.reloadVectorStoreAsync(storePath)
      
      return NextResponse.json({ 
        success: true, 
        chunks: result.newChunks || result.chunks || 0, // Return new chunks added
        pdfCount,
        chunkCount,
        message: "PDF indexed successfully"
      })
    } else {
      return NextResponse.json({ 
        error: result.error || 'Indexing failed' 
      }, { status: 500 })
    }

  } catch (error) {
    console.error('[Corpus Index] Error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 })
  }
}

