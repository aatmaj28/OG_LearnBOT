import { type NextRequest, NextResponse } from "next/server"
import path from "path"
import fs from "fs"
import { getClassById } from "@/lib/db-service"
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
    
    // Check if there are any PDFs in the directory
    const allPdfs = fs.existsSync(pdfDir) 
      ? fs.readdirSync(pdfDir).filter(f => f.toLowerCase().endsWith('.pdf'))
      : []
    
    if (fs.existsSync(filePath)) {
      // Delete the PDF file
      fs.unlinkSync(filePath)
      console.log(`[Corpus Delete] Deleted PDF: ${filename}`)
      
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
import chromadb
from chromadb.config import Settings as ChromaSettings

# Get collection name from folder name
base_path = sys.argv[1]
deleted_file = sys.argv[2]
clear_all = sys.argv[3] == "true" if len(sys.argv) > 3 else False

# Get collection name from folder name
folder_name = os.path.basename(os.path.normpath(base_path))
collection_name = folder_name.replace("/", "_").replace("\\\\", "_").replace(" ", "_")

# ChromaDB Server Mode Configuration
CHROMA_SERVER_URL = os.getenv("CHROMA_SERVER_URL", None)
CHROMA_SERVER_AUTH_TOKEN = os.getenv("CHROMA_SERVER_AUTH_TOKEN", "test-token")

# ChromaDB persist directory - try to read from config.json first, then calculate
config_path = os.path.join(base_path, "config.json")
chroma_persist_dir = None

if os.path.exists(config_path):
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
        if "chroma_persist_dir" in config:
            chroma_persist_dir = config["chroma_persist_dir"]
    except:
        pass

# Fallback: calculate from base_path
# base_path is like: project_root/vector_stores/folder_name
# We need: project_root/vector-stores/chroma
if not chroma_persist_dir:
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(base_path)))
    chroma_persist_dir = os.path.join(project_root, "vector-stores", "chroma")

try:
    # Initialize ChromaDB client (server mode or embedded mode)
    if CHROMA_SERVER_URL:
        # Server mode: Connect via HTTP
        print(f"[ChromaDB Delete] Connecting to ChromaDB server at: {CHROMA_SERVER_URL}", file=sys.stderr)
        # Parse URL to extract host and port
        url_clean = CHROMA_SERVER_URL.replace("http://", "").replace("https://", "")
        if ":" in url_clean:
            host, port_str = url_clean.split(":", 1)
            port = int(port_str.split("/")[0])  # Handle trailing slashes
        else:
            host = url_clean.split("/")[0]
            port = 8000
        
        # Create settings - for now, disable authentication for local dev
        # Create settings with token authentication
        if CHROMA_SERVER_AUTH_TOKEN and CHROMA_SERVER_AUTH_TOKEN != "test-token":
            auth_token = CHROMA_SERVER_AUTH_TOKEN
        else:
            auth_token = "test-token"
        
        print(f"[ChromaDB Delete] 🔐 Attempting token authentication with token: {'***' + auth_token[-4:] if len(auth_token) > 4 else '***'}", file=sys.stderr)
        
        # Try multiple authentication methods
        chroma_client = None
        auth_method_used = None
        
        # Method 1: Try using Settings with token auth provider
        try:
            settings = ChromaSettings(
                anonymized_telemetry=False,
                chroma_client_auth_provider="chromadb.auth.token_authn.TokenAuthClientProvider",
                chroma_client_auth_credentials=auth_token
            )
            chroma_client = chromadb.HttpClient(host=host, port=port, settings=settings)
            auth_method_used = "TokenAuthClientProvider (Settings)"
            print(f"[ChromaDB Delete] ✅ Connected using {auth_method_used}", file=sys.stderr)
        except Exception as e1:
            print(f"[ChromaDB Delete] ⚠️  Method 1 failed: {str(e1)[:100]}", file=sys.stderr)
            
            # Method 2: Try with headers parameter (if supported)
            try:
                settings = ChromaSettings(anonymized_telemetry=False)
                chroma_client = chromadb.HttpClient(
                    host=host,
                    port=port,
                    settings=settings,
                    headers={"Authorization": f"Bearer {auth_token}"}
                )
                auth_method_used = "Bearer token (headers)"
                print(f"[ChromaDB Delete] ✅ Connected using {auth_method_used}", file=sys.stderr)
            except (TypeError, Exception) as e2:
                print(f"[ChromaDB Delete] ⚠️  Method 2 failed: {str(e2)[:100]}", file=sys.stderr)
                
                # Method 3: Try without auth (fallback)
                try:
                    settings = ChromaSettings(anonymized_telemetry=False)
                    chroma_client = chromadb.HttpClient(host=host, port=port, settings=settings)
                    auth_method_used = "No authentication (fallback)"
                    print(f"[ChromaDB Delete] ⚠️  Connected without authentication (server may reject requests)", file=sys.stderr)
                except Exception as e3:
                    error_msg = f"All connection methods failed. Last error: {str(e3)}"
                    print(f'{{"success": false, "error": "{error_msg}"}}')
                    print(f"[ChromaDB Delete] ERROR: {error_msg}", file=sys.stderr)
                    sys.exit(1)
        
        if chroma_client is None:
            error_msg = "Failed to create ChromaDB client"
            print(f'{{"success": false, "error": "{error_msg}"}}')
            print(f"[ChromaDB Delete] ERROR: {error_msg}", file=sys.stderr)
            sys.exit(1)
        
        print(f"[ChromaDB Delete] 🔐 Authentication method used: {auth_method_used}", file=sys.stderr)
    else:
        # Embedded mode: Use local persistent storage
        if not os.path.exists(chroma_persist_dir):
            error_msg = f"ChromaDB directory not found: {chroma_persist_dir}"
            print(f'{{"success": false, "error": "{error_msg}"}}')
            print(f"[ChromaDB Delete] ERROR: {error_msg}", file=sys.stderr)
            sys.exit(1)
        
        chroma_client = chromadb.PersistentClient(
            path=chroma_persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False)
        )
    
    # Get collection
    try:
        collection = chroma_client.get_collection(name=collection_name)
        print(f"[ChromaDB Delete] Connected to collection: {collection_name}", file=sys.stderr)
    except Exception as e:
        error_msg = f"Collection not found: {collection_name}. Error: {str(e)}"
        print(f'{{"success": false, "error": "{error_msg}"}}')
        print(f"[ChromaDB Delete] ERROR: {error_msg}", file=sys.stderr)
        sys.exit(1)
    
    # Get all documents with metadata to find ones to delete
    # Note: IDs are always returned by ChromaDB, don't include "ids" in include parameter
    results = collection.get(include=["metadatas", "documents"])
    
    # IDs are always returned, even if not in include
    result_ids = results.get("ids", [])
    if not results or not result_ids:
        print(f'{{"success": true, "chunks_removed": 0, "chunks_remaining": 0}}')
        sys.exit(0)
    
    # Find IDs of chunks to delete
    ids_to_delete = []
    total_chunks = len(result_ids)
    print(f"[ChromaDB Delete] Total chunks in collection: {total_chunks}", file=sys.stderr)
    
    if clear_all:
        # Clear all chunks if no PDFs remain
        ids_to_delete = result_ids
        print(f"[ChromaDB Delete] Clearing ALL chunks (no PDFs remaining)", file=sys.stderr)
else:
        # Find chunks from the specific deleted file
        print(f"[ChromaDB Delete] Looking for chunks from file: {deleted_file}", file=sys.stderr)
        for i, meta in enumerate(results.get("metadatas", [])):
            if meta and meta.get("source_file") == deleted_file:
                ids_to_delete.append(result_ids[i])
            elif meta:
                print(f"[ChromaDB Delete] Found chunk from: {meta.get('source_file', 'unknown')}", file=sys.stderr)
    
    chunks_removed = len(ids_to_delete)
    print(f"[ChromaDB Delete] Found {chunks_removed} chunks to delete", file=sys.stderr)
    
    if chunks_removed > 0:
        # Delete chunks from collection
        collection.delete(ids=ids_to_delete)
        print(f"[ChromaDB Delete] Successfully removed {chunks_removed} chunks", file=sys.stderr)
    else:
        print(f"[ChromaDB Delete] WARNING: No chunks found to delete", file=sys.stderr)
    
    # Get updated count
    remaining_count = collection.count()
    
    # Update metadata.json
    meta_json_path = os.path.join(base_path, "metadata.json")
    if remaining_count > 0:
        # Get remaining documents
        remaining_results = collection.get(include=["metadatas", "documents"])
        if remaining_results and remaining_results.get("documents"):
            documents_list = remaining_results["documents"] or []
            metadatas_list = remaining_results["metadatas"] or []
            
            new_metadata = []
            for i, (doc_text, meta) in enumerate(zip(documents_list, metadatas_list)):
                new_metadata.append({
                    "source_file": meta.get("source_file", "") if meta else "",
                    "chunk_index": i,
                    "chunk_text": doc_text or "",
                    "section_title": meta.get("section_title", "") if meta else ""
                })
            
            with open(meta_json_path, 'w', encoding='utf-8') as f:
                json.dump(new_metadata, f, ensure_ascii=False, indent=2)
        else:
            # If no documents, create empty array
            with open(meta_json_path, 'w', encoding='utf-8') as f:
                json.dump([], f)
    else:
        # No chunks left, create empty metadata.json
    with open(meta_json_path, 'w', encoding='utf-8') as f:
            json.dump([], f)
    
    # Update config.json with new count
    config_path = os.path.join(base_path, "config.json")
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
            print(f"[ChromaDB Delete] Removed old FAISS index file", file=sys.stderr)
        except:
            pass
    if os.path.exists(faiss_metadata_path):
        try:
            os.remove(faiss_metadata_path)
            print(f"[ChromaDB Delete] Removed old FAISS metadata file", file=sys.stderr)
        except:
            pass
    
    print(f'{{"success": true, "chunks_removed": {chunks_removed}, "chunks_remaining": {remaining_count}}}')
    
except Exception as e:
    import traceback
    error_msg = str(e).replace('"', '\\"').replace('\\n', ' ')
    print(f'{{"success": false, "error": "{error_msg}"}}')
    print(f"[ChromaDB Delete] EXCEPTION: {error_msg}", file=sys.stderr)
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
              message: `PDF and ${deleteResult.chunks_removed || 0} chunks removed from index. ${deleteResult.chunks_remaining || 0} chunks remaining.`
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
            message: `PDF deleted. Note: Some chunks may still be in the index. Error: ${errorMessage}. Re-index to clean up.` 
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
import chromadb
from chromadb.config import Settings as ChromaSettings

base_path = sys.argv[1]

# Get collection name from folder name
folder_name = os.path.basename(os.path.normpath(base_path))
collection_name = folder_name.replace("/", "_").replace("\\\\", "_").replace(" ", "_")

# ChromaDB Server Mode Configuration
CHROMA_SERVER_URL = os.getenv("CHROMA_SERVER_URL", None)
CHROMA_SERVER_AUTH_TOKEN = os.getenv("CHROMA_SERVER_AUTH_TOKEN", "test-token")

# ChromaDB persist directory
config_path = os.path.join(base_path, "config.json")
chroma_persist_dir = None

if os.path.exists(config_path):
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
        if "chroma_persist_dir" in config:
            chroma_persist_dir = config["chroma_persist_dir"]
    except:
        pass

if not chroma_persist_dir:
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(base_path)))
    chroma_persist_dir = os.path.join(project_root, "vector-stores", "chroma")

try:
    # Initialize ChromaDB client (server mode or embedded mode)
    if CHROMA_SERVER_URL:
        # Server mode: Connect via HTTP
        print(f"[ChromaDB Clear] Connecting to ChromaDB server at: {CHROMA_SERVER_URL}", file=sys.stderr)
        # Parse URL to extract host and port
        url_clean = CHROMA_SERVER_URL.replace("http://", "").replace("https://", "")
        if ":" in url_clean:
            host, port_str = url_clean.split(":", 1)
            port = int(port_str.split("/")[0])  # Handle trailing slashes
        else:
            host = url_clean.split("/")[0]
            port = 8000
        
        # Create settings - for now, disable authentication for local dev
        # Create settings with token authentication
        if CHROMA_SERVER_AUTH_TOKEN and CHROMA_SERVER_AUTH_TOKEN != "test-token":
            auth_token = CHROMA_SERVER_AUTH_TOKEN
        else:
            auth_token = "test-token"
        
        print(f"[ChromaDB Delete] 🔐 Attempting token authentication with token: {'***' + auth_token[-4:] if len(auth_token) > 4 else '***'}", file=sys.stderr)
        
        # Try multiple authentication methods
        chroma_client = None
        auth_method_used = None
        
        # Method 1: Try using Settings with token auth provider
        try:
            settings = ChromaSettings(
                anonymized_telemetry=False,
                chroma_client_auth_provider="chromadb.auth.token_authn.TokenAuthClientProvider",
                chroma_client_auth_credentials=auth_token
            )
            chroma_client = chromadb.HttpClient(host=host, port=port, settings=settings)
            auth_method_used = "TokenAuthClientProvider (Settings)"
            print(f"[ChromaDB Delete] ✅ Connected using {auth_method_used}", file=sys.stderr)
        except Exception as e1:
            print(f"[ChromaDB Delete] ⚠️  Method 1 failed: {str(e1)[:100]}", file=sys.stderr)
            
            # Method 2: Try with headers parameter (if supported)
            try:
                settings = ChromaSettings(anonymized_telemetry=False)
                chroma_client = chromadb.HttpClient(
                    host=host,
                    port=port,
                    settings=settings,
                    headers={"Authorization": f"Bearer {auth_token}"}
                )
                auth_method_used = "Bearer token (headers)"
                print(f"[ChromaDB Delete] ✅ Connected using {auth_method_used}", file=sys.stderr)
            except (TypeError, Exception) as e2:
                print(f"[ChromaDB Delete] ⚠️  Method 2 failed: {str(e2)[:100]}", file=sys.stderr)
                
                # Method 3: Try without auth (fallback)
                try:
                    settings = ChromaSettings(anonymized_telemetry=False)
                    chroma_client = chromadb.HttpClient(host=host, port=port, settings=settings)
                    auth_method_used = "No authentication (fallback)"
                    print(f"[ChromaDB Delete] ⚠️  Connected without authentication (server may reject requests)", file=sys.stderr)
                except Exception as e3:
                    error_msg = f"All connection methods failed. Last error: {str(e3)}"
                    print(f'{{"success": false, "error": "{error_msg}"}}')
                    print(f"[ChromaDB Delete] ERROR: {error_msg}", file=sys.stderr)
                    sys.exit(1)
        
        if chroma_client is None:
            error_msg = "Failed to create ChromaDB client"
            print(f'{{"success": false, "error": "{error_msg}"}}')
            print(f"[ChromaDB Delete] ERROR: {error_msg}", file=sys.stderr)
            sys.exit(1)
        
        print(f"[ChromaDB Delete] 🔐 Authentication method used: {auth_method_used}", file=sys.stderr)
    else:
        # Embedded mode: Use local persistent storage
        if not os.path.exists(chroma_persist_dir):
            print(f'{{"success": true, "chunks_removed": 0, "chunks_remaining": 0}}')
            sys.exit(0)
        
        chroma_client = chromadb.PersistentClient(
            path=chroma_persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False)
        )
    
    collection = None
    try:
        collection = chroma_client.get_collection(name=collection_name)
        print(f"[ChromaDB Clear] Connected to collection: {collection_name}", file=sys.stderr)
    except Exception as e:
        print(f"[ChromaDB Clear] Collection '{collection_name}' not found (may be old FAISS data): {str(e)}", file=sys.stderr)
        # Continue - we'll still clear config.json and metadata.json
        collection = None
    
    # Get all IDs and delete everything from ChromaDB (if collection exists)
    total_chunks = 0
    if collection:
        try:
            results = collection.get(include=["metadatas"])
            result_ids = results.get("ids", [])
            total_chunks = len(result_ids)
            print(f"[ChromaDB Clear] Found {total_chunks} chunks in ChromaDB collection", file=sys.stderr)
            
            if total_chunks > 0:
                collection.delete(ids=result_ids)
                print(f"[ChromaDB Clear] Successfully cleared all {total_chunks} chunks from ChromaDB", file=sys.stderr)
            else:
                print(f"[ChromaDB Clear] ChromaDB collection is already empty", file=sys.stderr)
        except Exception as e:
            error_msg = f"Error getting/deleting chunks from ChromaDB: {str(e)}"
            print(f"[ChromaDB Clear] WARNING: {error_msg}", file=sys.stderr)
            # Continue - we'll still clear config.json and metadata.json
    else:
        # No ChromaDB collection - check metadata.json for old FAISS data
        meta_json_path = os.path.join(base_path, "metadata.json")
        if os.path.exists(meta_json_path):
            try:
                with open(meta_json_path, 'r', encoding='utf-8') as f:
                    old_metadata = json.load(f)
                    if isinstance(old_metadata, list):
                        total_chunks = len(old_metadata)
                        print(f"[ChromaDB Clear] Found {total_chunks} chunks in old metadata.json", file=sys.stderr)
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
            print(f"[ChromaDB Clear] Removed old FAISS index file", file=sys.stderr)
        except:
            pass
    if os.path.exists(faiss_metadata_path):
        try:
            os.remove(faiss_metadata_path)
            print(f"[ChromaDB Clear] Removed old FAISS metadata file", file=sys.stderr)
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
            // Return response immediately, reload vector store asynchronously in background (fire-and-forget)
            ragService.reloadVectorStoreAsync(basePath)
            
            return NextResponse.json({ 
              success: true, 
              pdfCount: 0,
              chunkCount: 0,
              message: `Cleared all ${clearResult.chunks_removed || 0} chunks (no PDFs found).` 
            })
          } else {
            // Script ran but failed - return error message
            const errorMsg = clearResult.error || "Failed to clear chunks from ChromaDB"
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



