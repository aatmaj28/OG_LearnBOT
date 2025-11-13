/**
 * Background Analytics Worker
 * Processes all conversations on server startup to pre-compute analytics
 * Runs in the background so analytics are ready instantly when users view the Analytics tab
 */

import { pool } from './db'
import { getRAGConversationsByUser } from './db-service'
import type { RAGConversation } from './types'

let isProcessing = false
let processingComplete = false

/**
 * Process a single conversation to generate summary and analytics
 */
async function processConversation(conversation: RAGConversation): Promise<void> {
  try {
    // Skip if already processed recently (within last hour)
    if (conversation.analyticsLastUpdated) {
      const hoursSinceUpdate = (Date.now() - conversation.analyticsLastUpdated.getTime()) / (1000 * 60 * 60)
      if (hoursSinceUpdate < 1) {
        console.log(`[Analytics Worker] Skipping conversation ${conversation.id} - updated ${hoursSinceUpdate.toFixed(1)}h ago`)
        return
      }
    }

    // Skip if no messages
    if (!conversation.messageHistory || conversation.messageHistory.length < 2) {
      console.log(`[Analytics Worker] Skipping conversation ${conversation.id} - insufficient messages`)
      return
    }

    console.log(`[Analytics Worker] Processing conversation ${conversation.id} (${conversation.messageHistory.length} messages)`)

    // Import functions
    const { updateRAGConversation, generateConversationSummary, analyzeLatestConversation } = await import('./db-service')
    
    // Generate summary if missing or outdated
    let summary = conversation.conversationSummary
    const messageCount = conversation.messageHistory.length
    if (!summary || (summary && messageCount > 10 && !conversation.analyticsLastUpdated)) {
      // Re-generate if summary is missing or conversation has grown significantly
      summary = await generateConversationSummary(conversation.messageHistory, summary)
    }

    // Generate analytics if missing or outdated
    if (!conversation.cachedSentiment || !conversation.cachedTopics || conversation.cachedTopics.length === 0) {
      const analysisResult = await analyzeLatestConversation(
        conversation.userId,
        conversation.classId,
        conversation.messageHistory,
        conversation.title,
        summary
      )

      // Update conversation with summary and analytics
      await updateRAGConversation(conversation.id, {
        conversationSummary: summary,
        cachedSentiment: analysisResult.sentiment,
        cachedTopics: analysisResult.topics,
        analyticsLastUpdated: new Date()
      })

      console.log(`[Analytics Worker] ✅ Processed conversation ${conversation.id}`)
    } else {
      // Just update summary if analytics are already cached
      if (summary && summary !== conversation.conversationSummary) {
        await updateRAGConversation(conversation.id, {
          conversationSummary: summary
        })
        console.log(`[Analytics Worker] ✅ Updated summary for conversation ${conversation.id}`)
      }
    }
  } catch (error) {
    console.error(`[Analytics Worker] ❌ Error processing conversation ${conversation.id}:`, error)
    // Continue processing other conversations
  }
}

/**
 * Process all active conversations in batches
 */
async function processAllConversations(): Promise<void> {
  if (isProcessing) {
    console.log('[Analytics Worker] Already processing, skipping...')
    return
  }

  isProcessing = true
  console.log('[Analytics Worker] 🚀 Starting background analytics processing...')

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

      console.log(`[Analytics Worker] Found ${conversations.length} active conversations to process`)

      // Process in batches of 5 to avoid overwhelming the system
      const batchSize = 5
      let processed = 0
      let skipped = 0

      for (let i = 0; i < conversations.length; i += batchSize) {
        const batch = conversations.slice(i, i + batchSize)
        await Promise.all(batch.map(conv => processConversation(conv)))
        processed += batch.length
        
        // Log progress every 10 conversations
        if (processed % 10 === 0) {
          console.log(`[Analytics Worker] Progress: ${processed}/${conversations.length} conversations processed`)
        }

        // Small delay between batches to avoid overwhelming the system
        if (i + batchSize < conversations.length) {
          await new Promise(resolve => setTimeout(resolve, 1000)) // 1 second delay
        }
      }

      processingComplete = true
      console.log(`[Analytics Worker] ✅ Completed! Processed ${processed} conversations`)
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
 * Call this on server startup
 */
export function startAnalyticsWorker(): void {
  // Run in background after a short delay to let server initialize
  setTimeout(() => {
    processAllConversations().catch(error => {
      console.error('[Analytics Worker] Fatal error:', error)
    })
  }, 5000) // Start after 5 seconds

  console.log('[Analytics Worker] 📋 Scheduled background analytics processing (starting in 5s)')
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

