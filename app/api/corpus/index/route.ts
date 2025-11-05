import { type NextRequest, NextResponse } from "next/server"
import path from "path"
import fs from "fs"
import { spawn } from "child_process"
import { getClassById } from "@/lib/db-service"
import { VectorStoreManager } from "@/lib/vector-store-manager"

export async function POST(request: NextRequest) {
  try {
    const { classId } = await request.json()
    console.log('[Corpus Index] Starting indexing for class:', classId)
    
    if (!classId) {
      return NextResponse.json({ error: "Class ID is required" }, { status: 400 })
    }

    const cls = await getClassById(classId)
    if (!cls?.vectorStoreFolder) {
      return NextResponse.json({ 
        error: "Class vector store not configured" 
      }, { status: 400 })
    }

    const storePath = VectorStoreManager.getVectorStorePathByFolder(cls.vectorStoreFolder)
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
    const indexPath = path.join(storePath, "faiss_index.bin")
    const metadataPath = path.join(storePath, "metadata.pkl")
    const hasExistingIndex = fs.existsSync(indexPath) && fs.existsSync(metadataPath)
    
    console.log(`[Corpus Index] Existing index found: ${hasExistingIndex}`)

    // Create Python script for indexing (supports incremental updates)
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
OUTPUT_PATH = "${storePath.replace(/\\/g, '\\\\')}"
PDF_PATHS = ${JSON.stringify(pdfFiles.map(p => p.replace(/\\/g, '\\\\')))}
HAS_EXISTING_INDEX = ${hasExistingIndex ? 'True' : 'False'}

print(f"[Index] Processing {len(PDF_PATHS)} PDFs for class: ${cls.name}", file=sys.stderr)
print(f"[Index] Incremental mode: {HAS_EXISTING_INDEX}", file=sys.stderr)

# Initialize embedding model
print("[Index] Loading embedding model...", file=sys.stderr)
embedding_model = SentenceTransformer("nomic-ai/nomic-embed-text-v1.5", trust_remote_code=True)

# Load existing index and metadata if available
existing_chunks = []
existing_metadata = []
existing_index = None
already_processed_files = set()

if HAS_EXISTING_INDEX:
    try:
        print("[Index] Loading existing index...", file=sys.stderr)
        existing_index = faiss.read_index(os.path.join(OUTPUT_PATH, "faiss_index.bin"))
        with open(os.path.join(OUTPUT_PATH, "metadata.pkl"), "rb") as f:
            existing_metadata = pickle.load(f)
        
        # Get list of already processed files
        already_processed_files = set(meta.get("source_file") for meta in existing_metadata)
        print(f"[Index] Found {len(existing_metadata)} existing chunks from {len(already_processed_files)} files", file=sys.stderr)
        
        # Reconstruct embeddings from existing index
        if existing_index.ntotal > 0:
            for i in range(existing_index.ntotal):
                vector = existing_index.reconstruct(i)
                existing_chunks.append(existing_metadata[i].get("chunk_text", ""))
        
    except Exception as e:
        print(f"[Index] Warning: Could not load existing index: {e}", file=sys.stderr)
        existing_index = None
        existing_metadata = []
        already_processed_files = set()

all_chunks = existing_chunks.copy()
all_metadata = existing_metadata.copy()
new_chunks_count = 0

# Process each PDF (skip already indexed ones)
for pdf_path in PDF_PATHS:
    try:
        pdf_filename = os.path.basename(pdf_path)
        
        # Skip if already processed (incremental mode)
        if pdf_filename in already_processed_files:
            print(f"[Index] Skipping (already indexed): {pdf_filename}", file=sys.stderr)
            continue
        
        print(f"[Index] Processing NEW file: {pdf_filename}", file=sys.stderr)
        
        reader = PdfReader(pdf_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text()
        
        # Chunk with 20% overlap
        chunk_size = 1000
        overlap = 200  # 20% overlap
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
        new_chunks_count += len(chunks)
        print(f"[Index] Extracted {len(chunks)} NEW chunks from {pdf_filename}", file=sys.stderr)
        
    except Exception as e:
        print(f"[Index] Error processing {pdf_path}: {e}", file=sys.stderr)
        continue

if len(all_chunks) == 0:
    print("[Index] ERROR: No chunks extracted!", file=sys.stderr)
    sys.exit(1)

if new_chunks_count == 0 and HAS_EXISTING_INDEX:
    print("[Index] No new PDFs to index. Using existing index.", file=sys.stderr)
    # Return existing stats
    print(json.dumps({"success": True, "chunks": len(all_chunks), "pdfs": len(PDF_PATHS), "new_chunks": 0}))
    sys.exit(0)

print(f"[Index] Total chunks: {len(all_chunks)} (including {len(existing_chunks)} existing)", file=sys.stderr)
print(f"[Index] New chunks to embed: {new_chunks_count}", file=sys.stderr)

# Generate embeddings (only for new chunks or all if no existing index)
if HAS_EXISTING_INDEX and existing_index is not None and new_chunks_count > 0:
    # Incremental: only embed new chunks
    print(f"[Index] Generating embeddings for {new_chunks_count} new chunks...", file=sys.stderr)
    new_chunks_only = all_chunks[len(existing_chunks):]
    
    # Process in batches to avoid memory issues
    batch_size = 32
    all_new_embeddings = []
    for i in range(0, len(new_chunks_only), batch_size):
        batch = new_chunks_only[i:i+batch_size]
        print(f"[Index] Embedding batch {i//batch_size + 1}/{(len(new_chunks_only)-1)//batch_size + 1}...", file=sys.stderr)
        batch_embeddings = embedding_model.encode(batch, show_progress_bar=False, batch_size=16)
        all_new_embeddings.extend(batch_embeddings)
    
    new_embeddings_np = np.array(all_new_embeddings).astype('float32')
    
    # Add new embeddings to existing index
    dimension = existing_index.d
    existing_index.add(new_embeddings_np)
    index = existing_index
    print(f"[Index] Added {new_chunks_count} new vectors to existing index", file=sys.stderr)
else:
    # Full rebuild with batching
    print(f"[Index] Generating embeddings for all {len(all_chunks)} chunks...", file=sys.stderr)
    
    # Process in batches to avoid memory issues
    batch_size = 32
    all_embeddings = []
    for i in range(0, len(all_chunks), batch_size):
        batch = all_chunks[i:i+batch_size]
        print(f"[Index] Embedding batch {i//batch_size + 1}/{(len(all_chunks)-1)//batch_size + 1}...", file=sys.stderr)
        batch_embeddings = embedding_model.encode(batch, show_progress_bar=False, batch_size=16)
        all_embeddings.extend(batch_embeddings)
    
    embeddings_np = np.array(all_embeddings).astype('float32')
    
    # Create new FAISS index
    dimension = embeddings_np.shape[1]
    index = faiss.IndexFlatL2(dimension)
    index.add(embeddings_np)
    print(f"[Index] Created new FAISS index with {index.ntotal} vectors", file=sys.stderr)

# Save everything
os.makedirs(OUTPUT_PATH, exist_ok=True)

faiss.write_index(index, os.path.join(OUTPUT_PATH, "faiss_index.bin"))
print(f"[Index] Saved FAISS index", file=sys.stderr)

with open(os.path.join(OUTPUT_PATH, "metadata.json"), "w", encoding="utf-8") as f:
    json.dump(all_metadata, f, ensure_ascii=False, indent=2)
print(f"[Index] Saved metadata.json", file=sys.stderr)

with open(os.path.join(OUTPUT_PATH, "metadata.pkl"), "wb") as f:
    pickle.dump(all_metadata, f)
print(f"[Index] Saved metadata.pkl", file=sys.stderr)

# Save config
config = {
    "class_id": "${classId}",
    "class_name": "${cls.name}",
    "embedding_model": "nomic-ai/nomic-embed-text-v1.5",
    "dimension": int(dimension),
    "total_chunks": len(all_chunks),
    "total_pdfs": len(PDF_PATHS),
    "chunk_size": 1000,
    "overlap": 200,
    "created_at": "${new Date().toISOString()}"
}

with open(os.path.join(OUTPUT_PATH, "config.json"), "w") as f:
    json.dump(config, f, indent=2)
print(f"[Index] Saved config.json", file=sys.stderr)

if HAS_EXISTING_INDEX and new_chunks_count > 0:
    print(f"[Index] ✅ Incremental indexing completed! Added {new_chunks_count} new chunks.", file=sys.stderr)
else:
    print(f"[Index] ✅ Indexing completed successfully!", file=sys.stderr)
print(json.dumps({"success": True, "chunks": len(all_chunks), "pdfs": len(PDF_PATHS), "new_chunks": new_chunks_count if HAS_EXISTING_INDEX else len(all_chunks)}))
`

    // Write Python script to temp file
    const scriptPath = path.join(process.cwd(), `temp_index_class_${classId}.py`)
    fs.writeFileSync(scriptPath, pythonScript)
    console.log('[Corpus Index] Python script created:', scriptPath)

    // Execute Python script
    const result = await new Promise<{ success: boolean; chunks?: number; error?: string }>((resolve) => {
      const pythonProcess = spawn('python', [scriptPath])
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
        // Clean up temp script
        try {
          fs.unlinkSync(scriptPath)
        } catch (e) {
          console.log('[Corpus Index] Could not delete temp script:', e)
        }

        if (code === 0) {
          try {
            const lastLine = stdoutData.trim().split('\n').pop()
            const result = JSON.parse(lastLine || '{}')
            resolve({ success: true, chunks: result.chunks })
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
      return NextResponse.json({ 
        success: true, 
        chunks: result.chunks,
        message: `Successfully indexed ${result.chunks} chunks for class: ${cls.name}`
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

