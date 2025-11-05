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

    // Create Python script to merge all embeddings
    const pythonScript = `
import sys
import os
import json
import pickle
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer
from pypdf import PdfReader

# Configuration
OUTPUT_PATH = "${ENTIRE_CORPUS_PATH.replace(/\\/g, '\\\\')}"
PDF_PATHS = ${JSON.stringify(allPdfPaths.map(p => p.replace(/\\/g, '\\\\')))}

print(f"[Merge] Processing {len(PDF_PATHS)} PDFs for entire corpus...", file=sys.stderr)

# Initialize embedding model
embedding_model = SentenceTransformer("nomic-ai/nomic-embed-text-v1.5")

all_chunks = []
all_metadata = []

# Process each PDF
for pdf_path in PDF_PATHS:
    try:
        pdf_filename = os.path.basename(pdf_path)
        print(f"[Merge] Processing: {pdf_filename}", file=sys.stderr)
        
        reader = PdfReader(pdf_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text()
        
        # Chunk with overlap
        chunk_size = 1000
        overlap = 200
        chunks = []
        start = 0
        while start < len(text):
            end = start + chunk_size
            chunk = text[start:end]
            if chunk.strip():
                chunks.append(chunk)
                all_metadata.append({
                    "source_file": pdf_filename,
                    "chunk_index": len(chunks) - 1,
                    "chunk_text": chunk,
                    "section_title": f"Section from {pdf_filename}"
                })
            start += (chunk_size - overlap)
        
        all_chunks.extend(chunks)
        print(f"[Merge] Extracted {len(chunks)} chunks from {pdf_filename}", file=sys.stderr)
        
    except Exception as e:
        print(f"[Merge] Error processing {pdf_path}: {e}", file=sys.stderr)
        continue

if len(all_chunks) == 0:
    print("[Merge] ERROR: No chunks extracted!", file=sys.stderr)
    sys.exit(1)

print(f"[Merge] Total chunks: {len(all_chunks)}", file=sys.stderr)
print(f"[Merge] Generating embeddings...", file=sys.stderr)

# Generate embeddings
embeddings = embedding_model.encode(all_chunks, show_progress_bar=False)
embeddings_np = np.array(embeddings).astype('float32')

# Create FAISS index
dimension = embeddings_np.shape[1]
index = faiss.IndexFlatL2(dimension)
index.add(embeddings_np)

print(f"[Merge] Created FAISS index with {index.ntotal} vectors", file=sys.stderr)

# Save everything
os.makedirs(OUTPUT_PATH, exist_ok=True)

faiss.write_index(index, os.path.join(OUTPUT_PATH, "faiss_index.bin"))
print(f"[Merge] Saved FAISS index", file=sys.stderr)

with open(os.path.join(OUTPUT_PATH, "metadata.json"), "w", encoding="utf-8") as f:
    json.dump(all_metadata, f, ensure_ascii=False, indent=2)
print(f"[Merge] Saved metadata.json", file=sys.stderr)

with open(os.path.join(OUTPUT_PATH, "metadata.pkl"), "wb") as f:
    pickle.dump(all_metadata, f)
print(f"[Merge] Saved metadata.pkl", file=sys.stderr)

# Save config
config = {
    "embedding_model": "nomic-ai/nomic-embed-text-v1.5",
    "dimension": int(dimension),
    "total_chunks": len(all_chunks),
    "total_pdfs": len(PDF_PATHS),
    "created_at": "$(new Date().toISOString())"
}

with open(os.path.join(OUTPUT_PATH, "config.json"), "w") as f:
    json.dump(config, f, indent=2)
print(f"[Merge] Saved config.json", file=sys.stderr)

print(f"[Merge] ✅ Entire corpus created successfully!", file=sys.stderr)
print(json.dumps({"success": True, "chunks": len(all_chunks), "pdfs": len(PDF_PATHS)}))
`

    // Write Python script
    const scriptPath = path.join(process.cwd(), 'temp_merge_corpus.py')
    fs.writeFileSync(scriptPath, pythonScript)

    // Execute Python script
    return new Promise<NextResponse>((resolve) => {
      const python = spawn('python', [scriptPath])

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
        // Clean up script
        try {
          fs.unlinkSync(scriptPath)
        } catch (e) {
          // Ignore
        }

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



