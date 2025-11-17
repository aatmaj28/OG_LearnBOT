import { type NextRequest, NextResponse } from "next/server"
import { getClassesByFaculty, getClassesByStudent, createClass } from "@/lib/db-service"
import { VectorStoreManager } from "@/lib/vector-store-manager"
import { ensureDatabaseInitialized } from "@/lib/init-db"
import fs from 'fs'
import path from 'path'

export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseInitialized()
    
    const { searchParams } = new URL(request.url)
    const facultyId = searchParams.get("facultyId")
    const studentId = searchParams.get("studentId")

    if (facultyId) {
      const classes = await getClassesByFaculty(facultyId)
      return NextResponse.json({ classes })
    } else if (studentId) {
      const classes = await getClassesByStudent(studentId)
      return NextResponse.json({ classes })
    } else {
      return NextResponse.json({ error: "Faculty ID or Student ID required" }, { status: 400 })
    }
  } catch (error) {
    console.error("[v0] Get classes error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseInitialized()
    
    const { name, description, facultyId } = await request.json()

    if (!name || !facultyId) {
      return NextResponse.json({ error: "Name and faculty ID required" }, { status: 400 })
    }

    let newClass
    try {
      newClass = await createClass({
        name,
        description: description || "",
        facultyId,
        studentIds: [],
      })
    } catch (error: any) {
      // Handle duplicate class name error
      if (error.message && error.message.includes('already exists')) {
        return NextResponse.json({ error: error.message }, { status: 409 }) // 409 Conflict
      }
      throw error // Re-throw other errors
    }

    // Create vector store for the new class
    try {
      const vectorStoreCreated = await VectorStoreManager.createVectorStore(newClass.id)
      if (vectorStoreCreated) {
        console.log(`✅ Vector store created for class: ${newClass.name} (${newClass.vectorStoreFolder})`)
        console.log(`📁 Folder location: vector_stores/${newClass.vectorStoreFolder}/`)
      } else {
        console.warn(`❌ Failed to create vector store for class: ${newClass.name}`)
        // Try manual creation as fallback
        await createVectorStoreManually(newClass.vectorStoreFolder, newClass.name)
      }
    } catch (error) {
      console.error(`❌ Error creating vector store for class ${newClass.name}:`, error)
      // Try manual creation as fallback
      await createVectorStoreManually(newClass.vectorStoreFolder, newClass.name)
    }

    return NextResponse.json({ class: newClass })
  } catch (error) {
    console.error("[v0] Create class error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Manual fallback function to create vector store folder
async function createVectorStoreManually(folderName: string, className: string) {
  try {
    const vectorStoresDir = path.join(process.cwd(), 'vector_stores')
    const classVectorStoreDir = path.join(vectorStoresDir, folderName)
    
    // Create vector_stores directory if it doesn't exist
    if (!fs.existsSync(vectorStoresDir)) {
      fs.mkdirSync(vectorStoresDir, { recursive: true })
      console.log('📁 Created vector_stores directory')
    }
    
    // Create class-specific directory
    if (!fs.existsSync(classVectorStoreDir)) {
      fs.mkdirSync(classVectorStoreDir, { recursive: true })
      console.log(`📁 Created directory: vector_stores/${folderName}/`)
    }
    
    // Create placeholder config.json
    const configPath = path.join(classVectorStoreDir, 'config.json')
    const config = {
      class_name: className,
      vector_store_folder: folderName,
      created_at: new Date().toISOString(),
      embedding_model: "sentence-transformers/all-mpnet-base-v2",
      vector_store_type: "chromadb",
      status: "ready_for_indexing",
      note: "Upload PDFs and index them using the corpus management interface. ChromaDB will store the vectors automatically."
    }
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    console.log(`✅ Created placeholder config.json for ${className}`)
    console.log(`📁 Ready for manual upload: vector_stores/${folderName}/`)
    
    return true
  } catch (error) {
    console.error('❌ Manual vector store creation failed:', error)
    return false
  }
}
