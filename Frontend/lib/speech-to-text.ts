/**
 * Speech-to-Text Utility using Web Speech API
 * Provides browser-based speech recognition functionality
 */

import { voiceLogger } from './voice-logger'

export interface SpeechRecognitionResult {
  transcript: string
  confidence: number
  isFinal: boolean
}

export interface SpeechRecognitionOptions {
  continuous?: boolean // Keep listening after result
  interimResults?: boolean // Return interim results
  lang?: string // Language code (e.g., 'en-US')
  maxAlternatives?: number // Maximum number of alternative transcripts
}

export class SpeechToText {
  private recognition: any = null
  private isSupported: boolean = false
  private shouldKeepRecording: boolean = false
  private onEndCallback?: () => void
  private lastProcessedIndex: number = -1
  private processedFinalResults: Set<number> = new Set() // Track which result indices have been processed as final

  constructor() {
    // Check for browser support
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      this.isSupported = !!SpeechRecognition

      if (this.isSupported) {
        this.recognition = new SpeechRecognition()
        this.recognition.continuous = false
        this.recognition.interimResults = true
        this.recognition.lang = 'en-US'
        this.recognition.maxAlternatives = 1
      }
    }
  }

  /**
   * Check if speech recognition is supported in the current browser
   */
  isBrowserSupported(): boolean {
    return this.isSupported
  }

  /**
   * Start speech recognition
   * @param onResult Callback for recognition results
   * @param onError Callback for errors
   * @param options Recognition options
   * @returns Promise that resolves when recognition starts
   */
  start(
    onResult: (result: SpeechRecognitionResult) => void,
    onError?: (error: string) => void,
    options?: SpeechRecognitionOptions
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isSupported || !this.recognition) {
        const error = 'Speech recognition is not supported in this browser'
        console.error('[Voice] ❌', error)
        onError?.(error)
        reject(new Error(error))
        return
      }

      // Apply options
      const isContinuous = options?.continuous ?? false
      this.shouldKeepRecording = isContinuous
      
      if (options) {
        if (options.continuous !== undefined) this.recognition.continuous = options.continuous
        if (options.interimResults !== undefined) this.recognition.interimResults = options.interimResults
        if (options.lang) this.recognition.lang = options.lang
        if (options.maxAlternatives !== undefined) this.recognition.maxAlternatives = options.maxAlternatives
      }

      voiceLogger.info('🎤 Starting recognition', {
        continuous: this.recognition.continuous,
        interimResults: this.recognition.interimResults,
        lang: this.recognition.lang
      })

      // Reset processed index and final results tracking for new recognition session
      this.lastProcessedIndex = -1
      this.processedFinalResults.clear()

      // Set up event handlers
      this.recognition.onresult = (event: any) => {
        voiceLogger.info('📝 Result event received', {
          resultIndex: event.resultIndex,
          resultsLength: event.results.length,
          lastProcessedIndex: this.lastProcessedIndex
        })
        
        // Process ALL results in the event, but track which ones are new
        // The Web Speech API sends all results each time, but resultIndex tells us which is the latest
        let newFinalTranscript = ''
        let latestInterimTranscript = ''
        let hasNewResults = false
        
        // Process all results up to and including resultIndex
        // Track which results are new and which have been processed as final
        for (let i = 0; i <= event.resultIndex && i < event.results.length; i++) {
          const result = event.results[i]
          const transcript = result[0].transcript
          
          // Check if this is a new result index we haven't seen
          const isNewIndex = i > this.lastProcessedIndex
          // Check if this result is final and we haven't processed it as final yet
          const isFinalNotProcessed = result.isFinal && !this.processedFinalResults.has(i)
          // Check if this is an interim result that's new
          const isNewInterim = !result.isFinal && isNewIndex
          
          if (isFinalNotProcessed || isNewInterim) {
            hasNewResults = true
            voiceLogger.info(`  Result ${i} (${isFinalNotProcessed && !isNewIndex ? 'FINALIZED' : isNewIndex ? 'NEW' : 'PROCESSING'})`, {
              transcript: transcript.substring(0, 50) + (transcript.length > 50 ? '...' : ''),
              isFinal: result.isFinal,
              confidence: result[0].confidence,
              alreadyProcessedAsFinal: this.processedFinalResults.has(i)
            })
            
            if (result.isFinal && !this.processedFinalResults.has(i)) {
              // This is a final result we haven't processed yet
              newFinalTranscript += (newFinalTranscript ? ' ' : '') + transcript
              this.processedFinalResults.add(i) // Mark as processed
              voiceLogger.info(`  ✅ Marked result ${i} as processed (final)`)
            } else if (isNewInterim) {
              // Only use the latest interim result if it's a new index
              latestInterimTranscript = transcript
            }
          } else {
            voiceLogger.info(`  Result ${i} (skipping - ${result.isFinal ? 'already processed as final' : 'already processed'})`)
          }
        }
        
        // Update last processed index to the current resultIndex
        // This tracks the highest index we've seen, regardless of final/interim
        if (event.resultIndex > this.lastProcessedIndex) {
          this.lastProcessedIndex = event.resultIndex
        }
        
        // Send final results if we have new ones
        if (newFinalTranscript.trim()) {
          voiceLogger.info('✅ NEW Final transcript', { transcript: newFinalTranscript.substring(0, 100) })
          onResult({
            transcript: newFinalTranscript.trim(),
            confidence: 0.9,
            isFinal: true
          })
        } else if (latestInterimTranscript && hasNewResults) {
          // Send only the latest interim result if we have new results
          voiceLogger.info('⏳ Latest interim transcript', { transcript: latestInterimTranscript.substring(0, 100) })
          onResult({
            transcript: latestInterimTranscript,
            confidence: 0.7,
            isFinal: false
          })
        } else if (!hasNewResults) {
          voiceLogger.info('  No new results to process')
        }
      }

      this.recognition.onerror = (event: any) => {
        voiceLogger.error('❌ Error event', { error: event.error, event })
        
        let errorMessage = 'Speech recognition error'
        
        switch (event.error) {
          case 'no-speech':
            errorMessage = 'No speech detected. Please try again.'
            // In continuous mode, don't stop on no-speech, just restart
            if (this.shouldKeepRecording && this.recognition) {
              voiceLogger.info('🔄 Restarting after no-speech (continuous mode)')
              try {
                this.recognition.start()
              } catch (e) {
                voiceLogger.error('❌ Failed to restart', { error: e })
              }
              return // Don't call onError for no-speech in continuous mode
            }
            break
          case 'audio-capture':
            errorMessage = 'No microphone found. Please check your microphone settings.'
            this.shouldKeepRecording = false
            break
          case 'not-allowed':
            errorMessage = 'Microphone permission denied. Please allow microphone access.'
            this.shouldKeepRecording = false
            break
          case 'network':
            errorMessage = 'Network error. Please check your connection.'
            this.shouldKeepRecording = false
            break
          case 'aborted':
            console.log('[Voice] ⏹️ Recognition aborted (user stopped)')
            this.shouldKeepRecording = false
            return // Don't call onError for aborted (user action)
          default:
            errorMessage = `Speech recognition error: ${event.error}`
            this.shouldKeepRecording = false
        }

        onError?.(errorMessage)
        reject(new Error(errorMessage))
      }

      this.recognition.onstart = () => {
        voiceLogger.info('✅ Recognition started')
        resolve()
      }

      // Store callback to notify when recognition ends
      this.onEndCallback = () => {
        voiceLogger.info('⏹️ Recognition ended callback', {
          shouldKeepRecording: this.shouldKeepRecording,
          continuous: this.recognition.continuous
        })
      }

      this.recognition.onend = () => {
        voiceLogger.info('⏹️ onend event fired', {
          shouldKeepRecording: this.shouldKeepRecording,
          continuous: this.recognition.continuous,
          lastProcessedIndex: this.lastProcessedIndex
        })
        
        // When recognition ends, check if there are any unprocessed final results
        // Sometimes final results come in the onend event
        if (this.recognition && this.recognition.results) {
          try {
            // Check if there are any final results we haven't processed
            let unprocessedFinal = ''
            for (let i = this.lastProcessedIndex + 1; i < this.recognition.results.length; i++) {
              const result = this.recognition.results[i]
              if (result && result.isFinal) {
                const transcript = result[0].transcript
                unprocessedFinal += (unprocessedFinal ? ' ' : '') + transcript
                voiceLogger.info(`  Found unprocessed final result ${i} on end`, { transcript: transcript.substring(0, 50) })
              }
            }
            
            if (unprocessedFinal.trim()) {
              voiceLogger.info('✅ Processing final results from onend', { transcript: unprocessedFinal.substring(0, 100) })
              onResult({
                transcript: unprocessedFinal.trim(),
                confidence: 0.9,
                isFinal: true
              })
            }
          } catch (e) {
            voiceLogger.error('❌ Error processing final results on end', { error: e })
          }
        }
        
        // If we should keep recording (continuous mode and user hasn't stopped), restart
        if (this.shouldKeepRecording && this.recognition) {
          voiceLogger.info('🔄 Auto-restarting recognition (continuous mode)')
          try {
            // Small delay to avoid immediate restart issues
            setTimeout(() => {
              if (this.shouldKeepRecording && this.recognition) {
                voiceLogger.info('🔄 Actually restarting now...')
                this.recognition.start()
              } else {
                voiceLogger.info('⏹️ Skipping restart (shouldKeepRecording changed)')
              }
            }, 100)
          } catch (e) {
            voiceLogger.error('❌ Failed to restart recognition', { error: e })
            this.shouldKeepRecording = false
          }
        } else {
          voiceLogger.info('⏹️ Not restarting (user stopped or not continuous)')
        }
        
        this.onEndCallback?.()
      }

      // Reset processed index for new session
      this.lastProcessedIndex = -1

      // Start recognition
      try {
        voiceLogger.info('🚀 Calling recognition.start()')
        this.recognition.start()
      } catch (error: any) {
        voiceLogger.error('❌ Exception starting recognition', { error })
        const errorMessage = error.message || 'Failed to start speech recognition'
        onError?.(errorMessage)
        reject(new Error(errorMessage))
      }
    })
  }

  /**
   * Stop speech recognition
   */
  stop(): void {
    voiceLogger.info('🛑 Stopping recognition (user action)')
    this.shouldKeepRecording = false
    if (this.recognition) {
      try {
        this.recognition.stop()
      } catch (error) {
        voiceLogger.error('❌ Error stopping recognition', { error })
        // Ignore errors when stopping
      }
    }
  }

  /**
   * Abort speech recognition
   */
  abort(): void {
    voiceLogger.info('🚫 Aborting recognition')
    this.shouldKeepRecording = false
    if (this.recognition) {
      try {
        this.recognition.abort()
      } catch (error) {
        voiceLogger.error('❌ Error aborting recognition', { error })
        // Ignore errors when aborting
      }
    }
  }
}

// Export singleton instance
export const speechToText = new SpeechToText()

