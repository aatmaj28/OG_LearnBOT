import { type NextRequest, NextResponse } from "next/server"
import path from "path"
import fs from "fs"
import { getClassById, getCorpusFilesByClass, deleteCorpusFile, deleteAllCorpusFiles } from "@/lib/db-service"
import { VectorStoreManager } from "@/lib/vector-store-manager"
import { ragService } from "@/lib/rag-service"

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

    // Get files from database (source of truth)
    const corpusFiles = await getCorpusFilesByClass(classId, materialType as 'class_material' | 'syllabus')
    const files = corpusFiles.map(f => f.fileName)
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
    
    // Check if there are any PDFs in the directory
    const allPdfs = fs.existsSync(pdfDir) 
      ? fs.readdirSync(pdfDir).filter(f => f.toLowerCase().endsWith('.pdf'))
      : []
    
    if (fs.existsSync(filePath)) {
      // Delete the PDF file
      fs.unlinkSync(filePath)
      console.log(`[Corpus Delete] Deleted PDF: ${filename}`)
      
      // Delete from database
      await deleteCorpusFile(classId, filename, materialType as 'class_material' | 'syllabus')
      console.log(`[Corpus Delete] Removed ${filename} from database`)
      
      // Check if there are any PDFs left after deletion
      const remainingPdfs = fs.existsSync(pdfDir)
        ? fs.readdirSync(pdfDir).filter(f => f.toLowerCase().endsWith('.pdf'))
        : []
      
      // Delete chunks from ChromaDB collection
      const configPath = path.join(basePath, "config.json")
      
      if (fs.existsSync(configPath)) {
        try {
          // Use Python script to delete chunks from ChromaDB
          const { spawn } = require('child_process')
          
          // If no PDFs left, clear all chunks
          const shouldClearAll = remainingPdfs.length === 0
          
          const deleteScript = `
import sys
import os
import json
from qdrant_client import QdrantClient

# Get collection name from folder name
base_path = sys.argv[1]
deleted_file = sys.argv[2]
clear_all = sys.argv[3] == "true" if len(sys.argv) > 3 else False

# Get collection name from folder name
folder_name = os.path.basename(os.path.normpath(base_path))
collection_name = folder_name.replace("/", "_").replace("\\\\", "_").replace(" ", "_")
# Sanitize for Qdrant (keep alphanumeric and underscore)
collection_name = ''.join(c if c.isalnum() or c == '_' else '_' for c in collection_name)

# Qdrant Server Configuration
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", None)

# Qdrant persist directory - try to read from config.json first, then calculate
config_path = os.path.join(base_path, "config.json")
qdrant_persist_dir = None

if os.path.exists(config_path):
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
        # Check if config has qdrant_url or collection_name
        if config.get("qdrant_url") and config["qdrant_url"] != "local":
            QDRANT_URL = config["qdrant_url"]
    except:
        pass

# Fallback: calculate from base_path
# base_path is like: project_root/vector_stores/folder_name
# We need: project_root/vector-stores/qdrant
if not qdrant_persist_dir:
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(base_path)))
    qdrant_persist_dir = os.path.join(project_root, "vector-stores", "qdrant")

try:
    # Initialize Qdrant client (server mode by default, local mode if QDRANT_URL is empty)
    if QDRANT_URL and QDRANT_URL.strip() and QDRANT_URL != "local":
        # Server mode: Connect via HTTP
        print(f"[Qdrant Delete] Connecting to Qdrant server at: {QDRANT_URL}", file=sys.stderr)
        qdrant_client = QdrantClient(
            url=QDRANT_URL,
            api_key=QDRANT_API_KEY,
            timeout=60
        )
        print(f"[Qdrant Delete] ✅ Connected to Qdrant server", file=sys.stderr)
    else:
        # Local mode: Use local persistent storage
        if not os.path.exists(qdrant_persist_dir):
            error_msg = f"Qdrant directory not found: {qdrant_persist_dir}"
            print(f'{{"success": false, "error": "{error_msg}"}}')
            print(f"[Qdrant Delete] ERROR: {error_msg}", file=sys.stderr)
            sys.exit(1)
        
        qdrant_client = QdrantClient(path=qdrant_persist_dir)
        print(f"[Qdrant Delete] ✅ Using Qdrant local storage", file=sys.stderr)
    
    # Check if collection exists
    try:
        collection_info = qdrant_client.get_collection(collection_name)
        print(f"[Qdrant Delete] Connected to collection: {collection_name} ({collection_info.points_count} vectors)", file=sys.stderr)
    except Exception as e:
        error_msg = f"Collection not found: {collection_name}. Error: {str(e)}"
        print(f'{{"success": false, "error": "{error_msg}"}}')
        print(f"[Qdrant Delete] ERROR: {error_msg}", file=sys.stderr)
        sys.exit(1)
    
    # Get all points with payload to find ones to delete
    scroll_result = qdrant_client.scroll(
        collection_name=collection_name,
        limit=10000,  # Adjust if you have more than 10k chunks
        with_payload=True,
        with_vectors=False
    )
    points = scroll_result[0]  # First element is the list of points
    
    if not points:
        print(f'{{"success": true, "chunks_removed": 0, "chunks_remaining": 0}}')
        sys.exit(0)
    
    # Find IDs of chunks to delete
    ids_to_delete = []
    total_chunks = len(points)
    print(f"[Qdrant Delete] Total chunks in collection: {total_chunks}", file=sys.stderr)
    
    if clear_all:
        # Clear all chunks if no PDFs remain
        ids_to_delete = [point.id for point in points]
        print(f"[Qdrant Delete] Clearing ALL chunks (no PDFs remaining)", file=sys.stderr)
    else:
        # Find chunks from the specific deleted file
        print(f"[Qdrant Delete] Looking for chunks from file: {deleted_file}", file=sys.stderr)
        for point in points:
            payload = point.payload or {}
            if payload.get("source_file") == deleted_file:
                ids_to_delete.append(point.id)
            else:
                print(f"[Qdrant Delete] Found chunk from: {payload.get('source_file', 'unknown')}", file=sys.stderr)
    
    chunks_removed = len(ids_to_delete)
    print(f"[Qdrant Delete] Found {chunks_removed} chunks to delete", file=sys.stderr)
    
    if chunks_removed > 0:
        # Delete chunks from collection
        qdrant_client.delete(
            collection_name=collection_name,
            points_selector=ids_to_delete
        )
        print(f"[Qdrant Delete] Successfully removed {chunks_removed} chunks", file=sys.stderr)
    else:
        print(f"[Qdrant Delete] WARNING: No chunks found to delete", file=sys.stderr)
    
    # Get updated count
    collection_info = qdrant_client.get_collection(collection_name)
    remaining_count = collection_info.points_count
    
    # Update metadata.json
    meta_json_path = os.path.join(base_path, "metadata.json")
    if remaining_count > 0:
        # Get remaining points
        remaining_scroll = qdrant_client.scroll(
            collection_name=collection_name,
            limit=10000,
            with_payload=True,
            with_vectors=False
        )
        remaining_points = remaining_scroll[0]
        
        if remaining_points:
            new_metadata = []
            for i, point in enumerate(remaining_points):
                payload = point.payload or {}
                new_metadata.append({
                    "source_file": payload.get("source_file", ""),
                    "chunk_index": i,
                    "chunk_text": payload.get("text", ""),
                    "section_title": payload.get("section_title", "")
                })
            
            with open(meta_json_path, 'w', encoding='utf-8') as f:
                json.dump(new_metadata, f, ensure_ascii=False, indent=2)
        else:
            # If no points, create empty array
            with open(meta_json_path, 'w', encoding='utf-8') as f:
                json.dump([], f)
    else:
        # No chunks left, create empty metadata.json
        with open(meta_json_path, 'w', encoding='utf-8') as f:
            json.dump([], f)
    
    # Update config.json with new count
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            config = json.load(f)
        config["total_chunks"] = remaining_count
        config["total_pdfs"] = 0  # Update PDF count too
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)
    
    # Clean up old FAISS files if they exist (migration cleanup)
    faiss_index_path = os.path.join(base_path, "faiss_index.bin")
    faiss_metadata_path = os.path.join(base_path, "metadata.pkl")
    if os.path.exists(faiss_index_path):
        try:
            os.remove(faiss_index_path)
            print(f"[Qdrant Delete] Removed old FAISS index file", file=sys.stderr)
        except:
            pass
    if os.path.exists(faiss_metadata_path):
        try:
            os.remove(faiss_metadata_path)
            print(f"[Qdrant Delete] Removed old FAISS metadata file", file=sys.stderr)
        except:
            pass
    
    print(f'{{"success": true, "chunks_removed": {chunks_removed}, "chunks_remaining": {remaining_count}}}')
    
except Exception as e:
    import traceback
    error_msg = str(e).replace('"', '\\"').replace('\\n', ' ')
    print(f'{{"success": false, "error": "{error_msg}"}}')
    print(f"[Qdrant Delete] EXCEPTION: {error_msg}", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)
`
          
          const tmpScript = path.join(basePath, "temp_delete_chroma.py")
          fs.writeFileSync(tmpScript, deleteScript)
          
          const py = spawn("python", [tmpScript, basePath, filename, shouldClearAll.toString()])
          
          let stdout = ""
          let stderr = ""
          py.stdout.on("data", (d: Buffer) => {
            const text = d.toString()
            stdout += text
            // Also log to console for debugging
            console.log("[Corpus Delete Python]", text.trim())
          })
          py.stderr.on("data", (d: Buffer) => {
            const text = d.toString()
            stderr += text
            // Also log to console for debugging
            console.error("[Corpus Delete Python Error]", text.trim())
          })
          
          let deleteResult: { success: boolean; chunks_removed?: number; chunks_remaining?: number; error?: string } = { success: false }
          
          await new Promise<void>((resolve) => {
            py.on("close", (code: number | null) => {
              try { fs.unlinkSync(tmpScript) } catch {}
              console.log("[Corpus Delete] Delete output:", stdout)
              if (stderr) console.error("[Corpus Delete] Delete stderr:", stderr)
              
              // Parse result from stdout (look for JSON in any line)
              try {
                const lines = stdout.trim().split('\n')
                for (const line of lines) {
                  const trimmed = line.trim()
                  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                    deleteResult = JSON.parse(trimmed)
                    break
                  }
                }
                // If no JSON in stdout, check stderr for error
                if (!deleteResult.success && stderr) {
                  const stderrLines = stderr.trim().split('\n')
                  for (const line of stderrLines) {
                    const trimmed = line.trim()
                    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                      deleteResult = JSON.parse(trimmed)
                      break
                    }
                  }
                }
              } catch (e) {
                console.error("[Corpus Delete] Failed to parse result:", e)
                console.error("[Corpus Delete] stdout:", stdout)
                console.error("[Corpus Delete] stderr:", stderr)
                if (code !== 0) {
                  deleteResult.error = `Python script exited with code ${code}. Check logs for details.`
                }
              }
              
              resolve()
            })
          })
          
          if (deleteResult.success) {
            // Get updated stats to return to UI immediately (before reload)
            let pdfCount = 0
            let chunkCount = deleteResult.chunks_remaining || 0
            
            try {
              // Count remaining PDFs
              if (fs.existsSync(pdfDir)) {
                const files = fs.readdirSync(pdfDir).filter(f => f.toLowerCase().endsWith('.pdf'))
                pdfCount = files.length
              }
              
              // Get chunk count from config.json (most accurate)
              const configPath = path.join(basePath, "config.json")
              if (fs.existsSync(configPath)) {
                try {
                  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
                  chunkCount = config.total_chunks || chunkCount
                } catch (e) {
                  console.error("Error reading config.json for stats:", e)
                }
              }
            } catch (e) {
              console.error("Error getting updated stats:", e)
            }
            
            // Return response immediately, reload vector store asynchronously in background (fire-and-forget)
            ragService.reloadVectorStoreAsync(basePath)
          
          return NextResponse.json({ 
            success: true, 
              pdfCount,
              chunkCount,
              message: "Removed PDFs successfully"
          })
          } else {
            const errorMsg = deleteResult.error || "Failed to delete chunks from ChromaDB"
            console.error("[Corpus Delete] Deletion failed:", errorMsg)
            throw new Error(errorMsg)
          }
        } catch (e) {
          console.error("[Corpus Delete] Error deleting from ChromaDB:", e)
          const errorMessage = e instanceof Error ? e.message : String(e)
          // Fallback: just confirm PDF deletion (chunks will remain, but PDF is gone)
          return NextResponse.json({ 
            success: true, 
            message: "Removed PDFs successfully" 
          })
        }
      } else {
        // No index exists yet, just confirm deletion
        // Get updated PDF count
        let pdfCount = 0
        try {
          if (fs.existsSync(pdfDir)) {
            const files = fs.readdirSync(pdfDir).filter(f => f.toLowerCase().endsWith('.pdf'))
            pdfCount = files.length
          }
        } catch (e) {
          console.error("Error getting PDF count:", e)
        }
        
        return NextResponse.json({ 
          success: true, 
          pdfCount,
          chunkCount: 0,
          message: "PDF deleted successfully."
        })
      }
    } else {
      // File doesn't exist - check if we should clear all chunks (no PDFs but chunks exist)
      const configPath = path.join(basePath, "config.json")
      if (fs.existsSync(configPath) && allPdfs.length === 0) {
        // No PDFs exist, but chunks might - clear all chunks
        try {
          const { spawn } = require('child_process')
          const clearAllScript = `
import sys
import os
import json
from qdrant_client import QdrantClient

base_path = sys.argv[1]

# Get collection name from folder name
folder_name = os.path.basename(os.path.normpath(base_path))
collection_name = folder_name.replace("/", "_").replace("\\\\", "_").replace(" ", "_")
# Sanitize for Qdrant (keep alphanumeric and underscore)
collection_name = ''.join(c if c.isalnum() or c == '_' else '_' for c in collection_name)

# Qdrant Server Configuration
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", None)

# Qdrant persist directory - try to read from config.json first
config_path = os.path.join(base_path, "config.json")
qdrant_persist_dir = None

if os.path.exists(config_path):
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
        # Check if config has qdrant_url
        if config.get("qdrant_url") and config["qdrant_url"] != "local":
            QDRANT_URL = config["qdrant_url"]
    except:
        pass

if not qdrant_persist_dir:
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(base_path)))
    qdrant_persist_dir = os.path.join(project_root, "vector-stores", "qdrant")

try:
    # Initialize Qdrant client (server mode by default, local mode if QDRANT_URL is empty)
    if QDRANT_URL and QDRANT_URL.strip() and QDRANT_URL != "local":
        # Server mode: Connect via HTTP
        print(f"[Qdrant Clear] Connecting to Qdrant server at: {QDRANT_URL}", file=sys.stderr)
        qdrant_client = QdrantClient(
            url=QDRANT_URL,
            api_key=QDRANT_API_KEY,
            timeout=60
        )
        print(f"[Qdrant Clear] ✅ Connected to Qdrant server", file=sys.stderr)
    else:
        # Local mode: Use local persistent storage
        if not os.path.exists(qdrant_persist_dir):
            print(f'{{"success": true, "chunks_removed": 0, "chunks_remaining": 0}}')
            sys.exit(0)
        
        qdrant_client = QdrantClient(path=qdrant_persist_dir)
        print(f"[Qdrant Clear] ✅ Using Qdrant local storage", file=sys.stderr)
    
    # Check if collection exists
    collection_exists = False
    try:
        collection_info = qdrant_client.get_collection(collection_name)
        print(f"[Qdrant Clear] Connected to collection: {collection_name} ({collection_info.points_count} vectors)", file=sys.stderr)
        collection_exists = True
    except Exception as e:
        print(f"[Qdrant Clear] Collection '{collection_name}' not found (may be old data): {str(e)}", file=sys.stderr)
        # Continue - we'll still clear config.json and metadata.json
    
    # Get all IDs and delete everything from Qdrant (if collection exists)
    total_chunks = 0
    if collection_exists:
        try:
            # Scroll to get all point IDs
            scroll_result = qdrant_client.scroll(
                collection_name=collection_name,
                limit=10000,
                with_payload=False,
                with_vectors=False
            )
            points = scroll_result[0]
            total_chunks = len(points)
            print(f"[Qdrant Clear] Found {total_chunks} chunks in Qdrant collection", file=sys.stderr)
            
            if total_chunks > 0:
                point_ids = [point.id for point in points]
                qdrant_client.delete(
                    collection_name=collection_name,
                    points_selector=point_ids
                )
                print(f"[Qdrant Clear] Successfully cleared all {total_chunks} chunks from Qdrant", file=sys.stderr)
            else:
                print(f"[Qdrant Clear] Qdrant collection is already empty", file=sys.stderr)
        except Exception as e:
            error_msg = f"Error getting/deleting chunks from Qdrant: {str(e)}"
            print(f"[Qdrant Clear] WARNING: {error_msg}", file=sys.stderr)
            # Continue - we'll still clear config.json and metadata.json
    else:
        # No Qdrant collection - check metadata.json for old data
        meta_json_path = os.path.join(base_path, "metadata.json")
        if os.path.exists(meta_json_path):
            try:
                with open(meta_json_path, 'r', encoding='utf-8') as f:
                    old_metadata = json.load(f)
                    if isinstance(old_metadata, list):
                        total_chunks = len(old_metadata)
                        print(f"[Qdrant Clear] Found {total_chunks} chunks in old metadata.json", file=sys.stderr)
            except:
                pass
    
    # Update config.json
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            config = json.load(f)
        config["total_chunks"] = 0
        config["total_pdfs"] = 0
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)
    
    # Clear metadata.json
    meta_json_path = os.path.join(base_path, "metadata.json")
    with open(meta_json_path, 'w', encoding='utf-8') as f:
        json.dump([], f)
    
    # Clean up old FAISS files if they exist (migration cleanup)
    faiss_index_path = os.path.join(base_path, "faiss_index.bin")
    faiss_metadata_path = os.path.join(base_path, "metadata.pkl")
    if os.path.exists(faiss_index_path):
        try:
            os.remove(faiss_index_path)
            print(f"[Qdrant Clear] Removed old FAISS index file", file=sys.stderr)
        except:
            pass
    if os.path.exists(faiss_metadata_path):
        try:
            os.remove(faiss_metadata_path)
            print(f"[Qdrant Clear] Removed old FAISS metadata file", file=sys.stderr)
        except:
            pass
    
    print(f'{{"success": true, "chunks_removed": {total_chunks}, "chunks_remaining": 0}}')
    
except Exception as e:
    import traceback
    error_msg = str(e).replace('"', '\\"').replace('\\n', ' ')
    print(f'{{"success": false, "error": "{error_msg}"}}')
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)
`
          
          const tmpScript = path.join(basePath, "temp_clear_all.py")
          fs.writeFileSync(tmpScript, clearAllScript)
          
          const py = spawn("python", [tmpScript, basePath])
          
          let stdout = ""
          let stderr = ""
          py.stdout.on("data", (d: Buffer) => {
            stdout += d.toString()
            console.log("[Corpus Clear All Python]", d.toString().trim())
          })
          py.stderr.on("data", (d: Buffer) => {
            stderr += d.toString()
            console.error("[Corpus Clear All Python Error]", d.toString().trim())
          })
          
          let clearResult: { success: boolean; chunks_removed?: number; chunks_remaining?: number; error?: string } = { success: false }
          
          await new Promise<void>((resolve) => {
            py.on("close", (code: number | null) => {
              try { fs.unlinkSync(tmpScript) } catch {}
              
              try {
                const lines = stdout.trim().split('\n')
                for (const line of lines) {
                  const trimmed = line.trim()
                  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                    clearResult = JSON.parse(trimmed)
                    break
                  }
                }
                // If no JSON in stdout, check stderr for error JSON
                if (!clearResult.success && stderr) {
                  const stderrLines = stderr.trim().split('\n')
                  for (const line of stderrLines) {
                    const trimmed = line.trim()
                    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                      try {
                        clearResult = JSON.parse(trimmed)
                        break
                      } catch (e) {
                        // Not JSON, continue
                      }
                    }
                  }
                }
                // If still no result and there's an error, set error from stderr
                if (!clearResult.success && code !== 0 && stderr) {
                  clearResult.error = stderr.split('\n').find(line => line.includes('ERROR') || line.includes('Error') || line.includes('Exception')) || "Unknown error occurred"
                }
              } catch (e) {
                console.error("[Corpus Clear All] Failed to parse result:", e)
                if (code !== 0) {
                  clearResult.error = `Python script exited with code ${code}. Check logs for details.`
                }
              }
              
              resolve()
            })
          })
          
          if (clearResult.success) {
            // Clear all corpus files from database
            await deleteAllCorpusFiles(classId, materialType as 'class_material' | 'syllabus')
            console.log(`[Corpus Clear All] Removed all corpus files from database for class ${classId}`)
            
            // Return response immediately, reload vector store asynchronously in background (fire-and-forget)
            ragService.reloadVectorStoreAsync(basePath)
            
            return NextResponse.json({ 
              success: true, 
              pdfCount: 0,
              chunkCount: 0,
              message: "Removed PDFs successfully" 
            })
          } else {
            // Script ran but failed - return error message
            const errorMsg = clearResult.error || "Failed to clear chunks from Qdrant"
            console.error("[Corpus Clear All] Script failed:", errorMsg)
            return NextResponse.json({ 
              success: false,
              error: errorMsg,
              message: `Failed to clear chunks: ${errorMsg}` 
            }, { status: 500 })
          }
        } catch (e) {
          console.error("[Corpus Clear All] Error:", e)
          const errorMessage = e instanceof Error ? e.message : String(e)
          return NextResponse.json({ 
            success: false,
            error: errorMessage,
            message: `Failed to clear chunks: ${errorMessage}` 
          }, { status: 500 })
        }
      }
      
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }
  } catch (error) {
    console.error("Corpus file delete error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}



