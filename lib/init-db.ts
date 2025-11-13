import { initializeDatabase } from './db'
import { startAnalyticsWorker } from './analytics-worker'

let isInitialized = false

export async function ensureDatabaseInitialized() {
  if (isInitialized) return
  
  try {
    await initializeDatabase()
    isInitialized = true
    console.log('Database initialized successfully')
    
    // Start background analytics worker after database is ready
    startAnalyticsWorker()
  } catch (error) {
    console.error('Failed to initialize database:', error)
    throw error
  }
}
