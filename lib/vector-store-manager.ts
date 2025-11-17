import fs from 'fs'
import path from 'path'
import { getClassById } from './db-service'

const VECTOR_STORES_BASE_PATH = path.join(process.cwd(), 'vector_stores')

export class VectorStoreManager {
  /**
   * Get the vector store path for a specific class
   */
  static getVectorStorePath(classId: string): string {
    return path.join(VECTOR_STORES_BASE_PATH, classId)
  }

  /**
   * Get the vector store path for a specific class by folder name
   */
  static getVectorStorePathByFolder(folderName: string): string {
    return path.join(VECTOR_STORES_BASE_PATH, folderName)
  }

  /**
   * Check if a vector store exists for a class
   */
  static async vectorStoreExists(classId: string): Promise<boolean> {
    try {
      const classData = await getClassById(classId)
      if (!classData?.vectorStoreFolder) return false

      const vectorStorePath = this.getVectorStorePathByFolder(classData.vectorStoreFolder)
      return fs.existsSync(vectorStorePath)
    } catch (error) {
      console.error('Error checking vector store existence:', error)
      return false
    }
  }

  /**
   * Create a vector store directory for a class
   */
  static async createVectorStore(classId: string): Promise<boolean> {
    try {
      const classData = await getClassById(classId)
      if (!classData?.vectorStoreFolder) {
        throw new Error('Class does not have a vector store folder name')
      }

      const vectorStorePath = this.getVectorStorePathByFolder(classData.vectorStoreFolder)
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(vectorStorePath)) {
        fs.mkdirSync(vectorStorePath, { recursive: true })
        console.log(`Created vector store directory: ${vectorStorePath}`)
      }

      // Create placeholder files if they don't exist
      const requiredFiles = ['config.json', 'metadata.json']
      for (const file of requiredFiles) {
        const filePath = path.join(vectorStorePath, file)
        if (!fs.existsSync(filePath)) {
          if (file === 'config.json') {
            // Create a basic config file
            fs.writeFileSync(filePath, JSON.stringify({
              class_id: classId,
              class_name: classData.name,
              created_at: new Date().toISOString(),
              embedding_model: "sentence-transformers/all-mpnet-base-v2",
              vector_store_type: "chromadb"
            }, null, 2))
          } else {
            // Create empty placeholder files
            fs.writeFileSync(filePath, '[]')
          }
          console.log(`Created placeholder file: ${file}`)
        }
      }

      return true
    } catch (error) {
      console.error('Error creating vector store:', error)
      return false
    }
  }

  /**
   * Copy vector store from source to destination
   */
  static async copyVectorStore(sourceFolder: string, destinationFolder: string): Promise<boolean> {
    try {
      const sourcePath = this.getVectorStorePathByFolder(sourceFolder)
      const destPath = this.getVectorStorePathByFolder(destinationFolder)

      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source vector store not found: ${sourcePath}`)
      }

      // Create destination directory
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true })
      }

      // Copy all files
      const files = fs.readdirSync(sourcePath)
      for (const file of files) {
        const sourceFile = path.join(sourcePath, file)
        const destFile = path.join(destPath, file)
        
        if (fs.statSync(sourceFile).isFile()) {
          fs.copyFileSync(sourceFile, destFile)
          console.log(`Copied ${file} to ${destinationFolder}`)
        }
      }

      return true
    } catch (error) {
      console.error('Error copying vector store:', error)
      return false
    }
  }

  /**
   * List all available vector stores
   */
  static listVectorStores(): string[] {
    try {
      if (!fs.existsSync(VECTOR_STORES_BASE_PATH)) {
        return []
      }
      
      return fs.readdirSync(VECTOR_STORES_BASE_PATH).filter(item => {
        const itemPath = path.join(VECTOR_STORES_BASE_PATH, item)
        return fs.statSync(itemPath).isDirectory()
      })
    } catch (error) {
      console.error('Error listing vector stores:', error)
      return []
    }
  }

  /**
   * Get vector store info for a class
   */
  static async getVectorStoreInfo(classId: string): Promise<{
    exists: boolean
    path: string
    folderName?: string
    files: string[]
  }> {
    try {
      const classData = await getClassById(classId)
      if (!classData?.vectorStoreFolder) {
        return {
          exists: false,
          path: '',
          files: []
        }
      }

      const vectorStorePath = this.getVectorStorePathByFolder(classData.vectorStoreFolder)
      const exists = fs.existsSync(vectorStorePath)
      
      let files: string[] = []
      if (exists) {
        files = fs.readdirSync(vectorStorePath)
      }

      return {
        exists,
        path: vectorStorePath,
        folderName: classData.vectorStoreFolder,
        files
      }
    } catch (error) {
      console.error('Error getting vector store info:', error)
      return {
        exists: false,
        path: '',
        files: []
      }
    }
  }
}
