import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { pool } from '@/lib/db'

const VECTOR_STORE_BASE_PATH = path.join(process.cwd(), 'vector_stores')
const ENTIRE_CORPUS_PATH = path.join(VECTOR_STORE_BASE_PATH, 'entire_corpus')

export async function POST(request: NextRequest) {
  console.log('[Merge All] Starting entire corpus merge...')
  
  try {
    // Get all classes with vector stores
    const client = await pool.connect()
    let classes
    try {
      const result = await client.query(`
        SELECT id, name, vector_store_folder 
        FROM classes 
        WHERE vector_store_folder IS NOT NULL
      `)
      classes = result.rows
    } finally {
      client.release()
    }

    if (classes.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No classes with corpus data found'
      }, { status: 400 })
    }

    console.log(`[Merge All] Found ${classes.length} classes to merge`)

    // Collect all PDF paths from all classes
    const allPdfPaths: string[] = []
    const classNames: string[] = []

    for (const classItem of classes) {
      const classPdfDir = path.join(VECTOR_STORE_BASE_PATH, classItem.vector_store_folder, 'source_pdfs')
      
      if (fs.existsSync(classPdfDir)) {
        const pdfFiles = fs.readdirSync(classPdfDir).filter(f => f.endsWith('.pdf'))
        for (const pdf of pdfFiles) {
          allPdfPaths.push(path.join(classPdfDir, pdf))
        }
        classNames.push(classItem.name)
      }
    }

    if (allPdfPaths.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No PDFs found across all classes'
      }, { status: 400 })
    }

    console.log(`[Merge All] Found ${allPdfPaths.length} total PDFs across ${classNames.length} classes`)

    // Create entire_corpus directory
    if (!fs.existsSync(ENTIRE_CORPUS_PATH)) {
      fs.mkdirSync(ENTIRE_CORPUS_PATH, { recursive: true })
    }

    // Use LlamaIndex-based indexing service for merging
    const indexingServicePath = path.join(process.cwd(), 'lib', 'llamaindex-indexing-service.py')
    
    // Prepare arguments for the indexing service (merge is not syllabus, no class_id/name)
    const args = [
      indexingServicePath,
      ENTIRE_CORPUS_PATH.replace(/\\/g, '/'),  // Normalize path separators
      'false',  // is_syllabus = false for merged corpus
      '',  // class_id = empty for merged corpus
      'Entire Corpus',  // class_name
      ...allPdfPaths.map(p => p.replace(/\\/g, '/'))  // Normalize path separators
    ]

    console.log('[Merge All] Using LlamaIndex indexing service')
    console.log('[Merge All] Service path:', indexingServicePath)

    // Determine Python executable to use (prefer venv if available)
    const venvPython = process.platform === 'win32' 
      ? path.join(process.cwd(), 'venv', 'Scripts', 'python.exe')
      : path.join(process.cwd(), 'venv', 'bin', 'python')
    const pythonExec = fs.existsSync(venvPython) ? venvPython : (process.env.PYTHON_PATH || 'python')
    
    // Execute LlamaIndex indexing service
    return new Promise<NextResponse>((resolve) => {
      const python = spawn(pythonExec, args)

      let stdout = ''
      let stderr = ''

      python.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      python.stderr.on('data', (data) => {
        const output = data.toString()
        stderr += output
        console.log('[Merge All]', output.trim())
      })

      python.on('close', (code) => {
        console.log(`[Merge All] Python process exited with code: ${code}`)
        console.log(`[Merge All] stderr: ${stderr}`)

        if (code === 0) {
          try {
            const result = JSON.parse(stdout.trim())
            resolve(NextResponse.json({
              success: true,
              message: 'Entire corpus created successfully',
              totalChunks: result.chunks,
              totalPdfs: result.pdfs,
              classes: classNames
            }))
          } catch (e) {
            console.error('[Merge All] Failed to parse output:', e)
            resolve(NextResponse.json({
              success: false,
              error: 'Failed to parse merge result'
            }, { status: 500 }))
          }
        } else {
          resolve(NextResponse.json({
            success: false,
            error: `Merge failed with code ${code}: ${stderr}`
          }, { status: 500 }))
        }
      })

      python.on('error', (err) => {
        console.error('[Merge All] Python error:', err)
        resolve(NextResponse.json({
          success: false,
          error: `Failed to start Python: ${err.message}`
        }, { status: 500 }))
      })
    })

  } catch (error) {
    console.error('[Merge All] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// GET endpoint to check status of entire corpus
export async function GET() {
  try {
    const configPath = path.join(ENTIRE_CORPUS_PATH, 'config.json')
    
    if (!fs.existsSync(configPath)) {
      return NextResponse.json({
        exists: false,
        message: 'Entire corpus not created yet'
      })
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    
    return NextResponse.json({
      exists: true,
      totalChunks: config.total_chunks,
      totalPdfs: config.total_pdfs,
      createdAt: config.created_at
    })
  } catch (error) {
    return NextResponse.json({
      exists: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}



