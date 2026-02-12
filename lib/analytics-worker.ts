/**
 * Background Analytics Worker
 * Processes all conversations to keep analytics up-to-date.
 * Runs once at startup (after 10s) and then every 4 hours.
 */

import { pool } from './db'
import { getRAGConversationsByUser } from './db-service'
import type { RAGConversation } from './types'

let isProcessing = false
let processingComplete = false
let analyticsInterval: NodeJS.Timeout | null = null

/**
 * Process a single conversation to generate summary and analytics
 */
async function processConversation(conversation: RAGConversation, forceUpdate: boolean = false): Promise<void> {
  try {
    // Skip if already processed recently (within last 4 hours) unless forced
    // On startup (forceUpdate=true), always process to ensure topics are extracted
    if (!forceUpdate && conversation.analyticsLastUpdated) {
      const minutesSinceUpdate = (Date.now() - conversation.analyticsLastUpdated.getTime()) / (1000 * 60)
      if (minutesSinceUpdate < 4 * 60) {
        return
      }
    }

    // Skip if no messages
    if (!conversation.messageHistory || conversation.messageHistory.length < 2) {
      return
    }

    // Import functions
    const { updateRAGConversation, generateConversationSummary, analyzeLatestConversation } = await import('./db-service')
    
    // Generate summary if missing or outdated
    let summary = conversation.conversationSummary
    const messageCount = conversation.messageHistory.length
    if (!summary || (summary && messageCount > 10 && !conversation.analyticsLastUpdated)) {
      // Re-generate if summary is missing or conversation has grown significantly
      summary = await generateConversationSummary(conversation.messageHistory, summary)
    }

    // Always regenerate analytics to keep them up-to-date with latest messages
    const analysisResult = await analyzeLatestConversation(
      conversation.userId,
      conversation.classId,
      conversation.messageHistory,
      conversation.title,
      summary
    )

    // Ensure topics are extracted (fallback if LLM analysis didn't return topics)
    let topicsToCache = analysisResult.topics || []
    if (topicsToCache.length === 0) {
      console.log(`[Analytics Worker] No topics from LLM analysis for conversation ${conversation.id}, using enhanced keyword extraction`)
      // Use enhanced keyword extraction as fallback
      const { extractEnhancedTopicsForAnalytics } = await import('./db-service')
      topicsToCache = extractEnhancedTopicsForAnalytics(conversation.messageHistory)
      if (topicsToCache.length === 0) {
        console.log(`[Analytics Worker] ⚠️ Still no topics extracted for conversation ${conversation.id} - may need more messages`)
      } else {
        console.log(`[Analytics Worker] ✅ Extracted ${topicsToCache.length} topics using keyword extraction for conversation ${conversation.id}`)
      }
    }

    // Update conversation with summary and analytics
    // Update title with summary if it's more meaningful than the default "Chat {date}" format
    const shouldUpdateTitle = !conversation.title || conversation.title.startsWith('Chat ')
    const titleToUse = shouldUpdateTitle && summary 
      ? summary.length > 60 ? summary.substring(0, 60).trim() + '...' : summary
      : conversation.title
    
    await updateRAGConversation(conversation.id, {
      title: titleToUse,
      conversationSummary: summary,
      cachedSentiment: analysisResult.sentiment,
      cachedTopics: topicsToCache,
      analyticsLastUpdated: new Date()
    })

    if (topicsToCache.length > 0) {
      console.log(`[Analytics Worker] ✅ Processed conversation ${conversation.id} - extracted ${topicsToCache.length} topics`)
    }
  } catch (error) {
    console.error(`[Analytics Worker] ❌ Error processing conversation ${conversation.id}:`, error)
    // Continue processing other conversations
  }
}

/**
 * Process all active conversations in batches
 * @param forceUpdate - If true, process all conversations regardless of last update time
 */
async function processAllConversations(forceUpdate: boolean = false): Promise<void> {
  if (isProcessing) {
    return
  }

  isProcessing = true

  try {
    const client = await pool.connect()
    
    try {
      // Get all active conversations
      const result = await client.query(`
        SELECT * FROM rag_conversations 
        WHERE status = 'active' 
        AND message_history::jsonb != '[]'::jsonb
        ORDER BY updated_at DESC
      `)

      const conversations: RAGConversation[] = result.rows.map(row => ({
        id: row.id.toString(),
        userId: row.user_id.toString(),
        userMaskedId: row.user_masked_id || `USER_${row.user_id}`,
        classId: row.class_id?.toString(),
        chatType: row.chat_type as 'class_material' | 'syllabus' | undefined,
        title: row.title,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        status: row.status as 'active' | 'archived',
        currentTopic: row.current_topic,
        checkpointState: row.checkpoint_state,
        messageHistory: row.message_history || [],
        studentProblemData: row.student_problem_data || { numbers: [] },
        cachedContext: row.cached_context,
        lastRetrievalTopic: row.last_retrieval_topic,
        cachedSentiment: row.cached_sentiment ? parseFloat(row.cached_sentiment) : undefined,
        cachedTopics: row.cached_topics || undefined,
        analyticsLastUpdated: row.analytics_last_updated ? new Date(row.analytics_last_updated) : undefined,
        conversationSummary: row.conversation_summary || undefined
      }))

      // Process in batches of 5 to avoid overwhelming the system
      const batchSize = 5
      let processed = 0

      console.log(`[Analytics Worker] 📊 Processing ${conversations.length} conversations (forceUpdate=${forceUpdate})`)

      for (let i = 0; i < conversations.length; i += batchSize) {
        const batch = conversations.slice(i, i + batchSize)
        await Promise.all(batch.map(conv => processConversation(conv, forceUpdate)))
        processed += batch.length

        // Small delay between batches to avoid overwhelming the system
        if (i + batchSize < conversations.length) {
          await new Promise(resolve => setTimeout(resolve, 1000)) // 1 second delay
        }
      }

      console.log(`[Analytics Worker] ✅ Processed ${processed} conversations`)
      processingComplete = true
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[Analytics Worker] ❌ Error during background processing:', error)
  } finally {
    isProcessing = false
  }
}

/**
 * Start background analytics processing (non-blocking)
 * Runs once on startup (with forceUpdate=true), then every 4 hours
 * Call this on server startup
 */
export function startAnalyticsWorker(): void {
  console.log('[Analytics Worker] 🚀 Starting analytics worker - will run on startup and every 4 hours')

  // Run initial processing after a delay to let RAG initialize first
  setTimeout(() => {
    console.log('[Analytics Worker] 🔄 Running initial analysis on startup (forceUpdate=true)...')
    processAllConversations(true).then(() => {
      console.log('[Analytics Worker] ✅ Initial analysis complete')
    }).catch(error => {
      console.error('[Analytics Worker] ❌ Fatal error in initial run:', error)
    })
  }, 10000) // Start after 10 seconds

  // Schedule recurring processing every 4 hours
  const FOUR_HOURS_MS = 4 * 60 * 60 * 1000
  analyticsInterval = setInterval(() => {
    console.log('[Analytics Worker] 🔄 Running scheduled 4-hour analysis...')
    processAllConversations(false).then(() => {
      console.log('[Analytics Worker] ✅ Scheduled analysis complete')
    }).catch(error => {
      console.error('[Analytics Worker] ❌ Fatal error in scheduled run:', error)
    })
  }, FOUR_HOURS_MS)

  console.log('[Analytics Worker] ✅ Analytics worker started - will run every 4 hours')
}

/**
 * Stop the analytics worker (useful for testing or graceful shutdown)
 */
export function stopAnalyticsWorker(): void {
  if (analyticsInterval) {
    clearInterval(analyticsInterval)
    analyticsInterval = null
    console.log('[Analytics Worker] ⏹️ Stopped recurring analytics processing')
  }
}

/**
 * Check if analytics processing is complete
 */
export function isAnalyticsProcessingComplete(): boolean {
  return processingComplete
}

/**
 * Manually trigger analytics processing (useful for testing or manual refresh)
 */
export async function triggerAnalyticsProcessing(): Promise<void> {
  await processAllConversations()
}

