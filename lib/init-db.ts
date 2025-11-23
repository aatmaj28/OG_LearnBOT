import { initializeDatabase } from './db'
import { startAnalyticsWorker } from './analytics-worker'
import { getRAGService } from './rag-service'

let isInitialized = false
let ragInitialized = false
let dbFallbackEnabled = false

export const isDatabaseFallbackEnabled = (): boolean => dbFallbackEnabled

export const enableDatabaseFallback = (reason: string, error?: unknown) => {
  if (dbFallbackEnabled) return
  dbFallbackEnabled = true
  isInitialized = true
  console.warn('[Init] ⚠️  Database unavailable - enabling mock data fallback. Reason:', reason)
  if (error) {
    console.warn('[Init] ⚠️  Original error:', error)
  }
}

/**
 * Initialize RAG service eagerly - highest priority for user experience
 * This ensures RAG is ready as soon as possible since users will want to chat immediately
 */
async function initializeRAGService(): Promise<void> {
  if (ragInitialized) return
  
  try {
    console.log('[Init] 🚀 Starting RAG service initialization (highest priority)...')
    const ragService = getRAGService()
    
    // Wait for RAG to be ready (with generous timeout for model loading)
    const isReady = await ragService.waitForInitialization(120000) // 2 minutes timeout
    
    if (isReady) {
      ragInitialized = true
      console.log('[Init] ✅ RAG service initialized and ready!')
    } else {
      console.warn('[Init] ⚠️  RAG service initialization timed out, but continuing...')
      // Don't block - RAG will continue initializing in background
    }
  } catch (error) {
    console.error('[Init] ❌ RAG service initialization error:', error)
    // Don't throw - allow app to continue, RAG will use fallback mode
  }
}

export async function ensureDatabaseInitialized() {
  if (isInitialized) return
  
  try {
    if (dbFallbackEnabled) {
      console.warn('[Init] ⚠️  Skipping database initialization (fallback already enabled)')
      return
    }
    // Step 1: Initialize database first (required for everything)
    await initializeDatabase()
    isInitialized = true
    console.log('[Init] ✅ Database initialized successfully')
    
    // Step 2: Initialize RAG service immediately (highest priority for user experience)
    // This happens in parallel with analytics worker setup, but RAG gets priority
    initializeRAGService().catch(error => {
      console.error('[Init] RAG initialization failed:', error)
    })
    
    // Step 3: Start analytics worker AFTER RAG initialization begins
    // Delay analytics start to give RAG priority on system resources
    // Analytics can wait - RAG readiness is critical for user experience
    setTimeout(() => {
      // Only start analytics if RAG has had time to initialize
      // This ensures RAG gets priority on CPU/memory during startup
      if (ragInitialized) {
        console.log('[Init] 📊 Starting analytics worker (RAG is ready)')
        startAnalyticsWorker()
      } else {
        // Wait a bit more for RAG, then start analytics anyway
        console.log('[Init] 📊 Starting analytics worker (RAG still initializing in background)')
        startAnalyticsWorker()
      }
    }, 3000) // Give RAG 3 seconds head start before analytics begins
    
  } catch (error: any) {
    const errorCode = error?.code || error?.errno
    const errorName = error?.name
    const recoverableErrors = ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN']
    if (recoverableErrors.includes(errorCode) || errorName === 'FetchError') {
      enableDatabaseFallback(`Database connection failed (${errorCode || errorName})`, error)
      return
    }
    console.error('[Init] ❌ Failed to initialize database:', error)
    throw error
  }
}
