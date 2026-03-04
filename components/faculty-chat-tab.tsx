"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MessageSquare, Send, Plus, Bot, BookOpen, Trash2, Zap, Calendar, Download, PanelLeftClose, PanelLeftOpen, Mic, MicOff, Paperclip, File, Brain, X } from "lucide-react"
import type { RAGConversation, Class, ModelBackend, ChatAttachment } from "@/lib/types"
import { getConversationCardTitle } from "@/lib/utils"
import { ChatMessage } from "@/components/chat-message"
import { speechToText } from "@/lib/speech-to-text"
import { VoiceWave } from "@/components/voice-wave"
import { voiceLogger } from "@/lib/voice-logger"
import { DeepThinkingAnimation } from "@/components/deep-thinking-animation"
import { toast } from "sonner"

type ChatType = "class_material" | "syllabus"

interface FacultyChatTabProps {
  isDarkMode: boolean
}

export function FacultyChatTab({ isDarkMode }: FacultyChatTabProps) {
  const [conversations, setConversations] = useState<RAGConversation[]>([])
  const [currentConversation, setCurrentConversation] = useState<RAGConversation | null>(null)
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [selectedClassId, setSelectedClassId] = useState<string>("")
  const [chatType, setChatType] = useState<ChatType>("class_material")
  const [preferredModel, setPreferredModel] = useState<ModelBackend>("remote-blackwell")
  const [taMode, setTaMode] = useState<'lenient' | 'normal' | 'strict'>('normal')
  const [classes, setClasses] = useState<Class[]>([])
  const [ragStatus, setRagStatus] = useState<{
    isAvailable: boolean
  }>({ isAvailable: false })
  const [userName, setUserName] = useState("")
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const shouldAutoScrollRef = useRef(true) // Track if we should auto-scroll
  const isScrollingProgrammaticallyRef = useRef(false)

  // Corpus/PDF check state
  const [hasCorpusPdfs, setHasCorpusPdfs] = useState<boolean | null>(null) // null = checking, true = has PDFs, false = no PDFs
  const [isCheckingCorpus, setIsCheckingCorpus] = useState(false) // Track if we're programmatically scrolling

  // File/Photo Upload state
  const [attachments, setAttachments] = useState<File[]>([])
  const [attachmentPreviews, setAttachmentPreviews] = useState<Array<{ file: File; preview: string }>>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Deep Thinking Mode state
  const [deepThinking, setDeepThinking] = useState(false)
  const [isDeepThinking, setIsDeepThinking] = useState(false) // For showing animation

  // Voice Input state
  const [isRecording, setIsRecording] = useState(false)
  const [isVoiceSupported, setIsVoiceSupported] = useState(false)
  const baseInputRef = useRef<string>('') // Store base input before recording

  useEffect(() => {
    loadUserData()
    loadClasses()
    loadConversations()
    checkRAGStatus()

    // Check voice input support
    setIsVoiceSupported(speechToText.isBrowserSupported())

    // Preload user's classes on mount (after RAG is ready)
    const preloadUserClasses = async () => {
      const userId = localStorage.getItem("userId")
      const userRole = localStorage.getItem("userRole") as 'student' | 'faculty' | null

      if (userId && userRole) {
        // Wait a bit for RAG service to initialize
        await new Promise(resolve => setTimeout(resolve, 2000))

        try {
          const { chatApi } = await import("@/lib/flask-api-client")
          const result = await chatApi.preloadRAG(userId, userRole)
          console.log(`[Faculty Chat] Preload result: ${result.loaded}/${result.total} stores loaded`)
          if (!result.success && result.error?.includes('not ready')) {
            // RAG not ready yet, retry after a delay
            setTimeout(preloadUserClasses, 3000)
          }
        } catch (error) {
          console.error('[Faculty Chat] Failed to preload classes:', error)
        }
      }
    }

    preloadUserClasses()

    // Poll status every 5 seconds to detect when RAG becomes ready
    const statusInterval = setInterval(checkRAGStatus, 5000)

    return () => clearInterval(statusInterval)
  }, [])

  useEffect(() => {
    // Clear current conversation when class changes
    setCurrentConversation(null)

    if (selectedClassId) {
      loadConversations()
      checkCorpusPdfs()
    } else {
      setHasCorpusPdfs(null)
      setConversations([])
    }
  }, [selectedClassId, chatType])

  // Check if selected class has PDFs uploaded
  const checkCorpusPdfs = async () => {
    if (!selectedClassId || selectedClassId === 'entire-corpus') {
      // Entire corpus always allows chat (it's a merged corpus)
      setHasCorpusPdfs(true)
      return
    }

    setIsCheckingCorpus(true)
    try {
      const { corpusApi } = await import("@/lib/flask-api-client")
      // Use getFiles to check if PDFs exist
      const data = await corpusApi.getFiles(selectedClassId, chatType)
      const hasPdfs = (data.files?.length || 0) > 0
      setHasCorpusPdfs(hasPdfs)
    } catch (error) {
      console.error('[Faculty Chat] Failed to check corpus PDFs:', error)
      setHasCorpusPdfs(false)
    } finally {
      setIsCheckingCorpus(false)
    }
  }

  // Reload conversations and clear current conversation when chat type changes
  useEffect(() => {
    if (selectedClassId) {
      setCurrentConversation(null) // Clear current conversation when switching types
      loadConversations()
    }
  }, [chatType])

  const loadUserData = async () => {
    const sessionId = localStorage.getItem("sessionId")
    if (!sessionId) return

    try {
      const { authApi, usersApi } = await import("@/lib/flask-api-client")
      const data = await authApi.getSession(sessionId)
      setUserName(data.user.name)
      // Load TA mode if available (per faculty - applies to all classes they teach)
      const userId = localStorage.getItem("userId")
      if (userId) {
        try {
          const taModeData = await usersApi.getTaMode(userId)
          setTaMode(taModeData.taMode || 'normal')
        } catch {
          setTaMode('normal')
        }
      }
    } catch (error) {
      console.error("[v0] Failed to load user data:", error)
    }
  }

  const checkRAGStatus = async () => {
    try {
      const { chatApi } = await import("@/lib/flask-api-client")
      const ragData = await chatApi.getRAGStatus()
      setRagStatus({
        isAvailable: ragData.isAvailable || false
      })
    } catch (error) {
      console.error('Failed to check AI status:', error)
    }
  }

  // Helper function to check if user is near bottom
  const isNearBottom = (element: HTMLDivElement) => {
    const { scrollTop, scrollHeight, clientHeight } = element
    return scrollHeight - scrollTop - clientHeight < 100 // 100px threshold
  }

  // Handle scroll events to detect user scrolling
  useEffect(() => {
    const scrollElement = scrollRef.current
    if (!scrollElement) return

    let scrollTimeout: NodeJS.Timeout | null = null
    let lastScrollTop = scrollElement.scrollTop

    const handleScroll = () => {
      // Ignore scroll events caused by our programmatic scrolling
      if (isScrollingProgrammaticallyRef.current) {
        return
      }

      const currentScrollTop = scrollElement.scrollTop
      // Only update if scroll position actually changed (user scrolled)
      if (currentScrollTop === lastScrollTop) {
        return
      }
      lastScrollTop = currentScrollTop

      // Debounce to avoid too many updates
      if (scrollTimeout) {
        clearTimeout(scrollTimeout)
      }

      scrollTimeout = setTimeout(() => {
        // This is user-initiated scrolling
        const isNear = isNearBottom(scrollElement)
        shouldAutoScrollRef.current = isNear
      }, 100)
    }

    scrollElement.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      scrollElement.removeEventListener('scroll', handleScroll)
      if (scrollTimeout) {
        clearTimeout(scrollTimeout)
      }
    }
  }, [])

  // Auto-scroll when conversation changes (e.g., loading a conversation)
  useEffect(() => {
    if (scrollRef.current && currentConversation) {
      // Small delay to ensure DOM is updated
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          isScrollingProgrammaticallyRef.current = true
          scrollRef.current.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth'
          })
          shouldAutoScrollRef.current = true
          setTimeout(() => {
            isScrollingProgrammaticallyRef.current = false
          }, 500) // Increased timeout to account for smooth scroll animation
        }
      })
    }
  }, [currentConversation?.id]) // Only when conversation ID changes, not on every message update

  // Smooth scroll when new messages are added (for assistant responses)
  useEffect(() => {
    if (scrollRef.current && currentConversation?.messageHistory && shouldAutoScrollRef.current) {
      // Small delay to ensure DOM is updated with new message
      const timeoutId = setTimeout(() => {
        if (scrollRef.current && shouldAutoScrollRef.current) {
          isScrollingProgrammaticallyRef.current = true
          scrollRef.current.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth'
          })
          setTimeout(() => {
            isScrollingProgrammaticallyRef.current = false
          }, 500)
        }
      }, 100)
      return () => clearTimeout(timeoutId)
    }
  }, [currentConversation?.messageHistory?.length]) // Trigger when message count changes

  // Smooth scroll when Deep Thinking animation appears
  useEffect(() => {
    if (isDeepThinking && scrollRef.current) {
      // Scroll to show the Deep Thinking animation when it appears
      const timeoutId = setTimeout(() => {
        if (scrollRef.current) {
          isScrollingProgrammaticallyRef.current = true
          scrollRef.current.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth'
          })
          shouldAutoScrollRef.current = true
          setTimeout(() => {
            isScrollingProgrammaticallyRef.current = false
          }, 500)
        }
      }, 200) // Small delay to ensure animation component is rendered
      return () => clearTimeout(timeoutId)
    }
  }, [isDeepThinking])

  const loadClasses = async () => {
    const userId = localStorage.getItem("userId")
    if (!userId) return

    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      const data = await classesApi.getClasses(userId)
      setClasses(data.classes || [])
      // Auto-select first class if available
      if (data.classes && data.classes.length > 0) {
        setSelectedClassId(data.classes[0].id)
      }
    } catch (error) {
      console.error("[v0] Failed to load classes:", error)
      setClasses([])
    }
  }

  // Helper function to sanitize content chunks during streaming (optimized character whitelist)
  const sanitizeContentChunk = (content: string): string => {
    if (!content) return content

    // Replace literal <br/>, <br>, <br /> with newlines so they don't show as raw text
    content = content.replace(/<br\s*\/?>/gi, '\n')

    // Fast path: check if all ASCII (most common case)
    let hasNonASCII = false
    for (let i = 0; i < content.length; i++) {
      if (content.charCodeAt(i) > 127) {
        hasNonASCII = true
        break
      }
    }
    if (!hasNonASCII) return content // Early exit for ASCII-only

    // Character whitelist filter (same as Python side)
    let result = ''
    for (let i = 0; i < content.length; i++) {
      const code = content.charCodeAt(i)
      // Allow: ASCII (0-127), safe Unicode ranges, and emojis
      if (code <= 127 ||
        (code >= 0x2000 && code <= 0x206F) ||  // General Punctuation
        (code >= 0x20A0 && code <= 0x20CF) ||  // Currency symbols
        (code >= 0x2100 && code <= 0x214F) ||  // Letterlike Symbols
        (code >= 0x2190 && code <= 0x21FF) ||  // Arrows
        (code >= 0x2200 && code <= 0x22FF) ||  // Mathematical Operators
        (code >= 0x2300 && code <= 0x23FF) ||  // Miscellaneous Technical
        (code >= 0x2400 && code <= 0x243F) ||  // Control Pictures
        (code >= 0x25A0 && code <= 0x25FF) ||  // Geometric Shapes
        (code >= 0x2600 && code <= 0x26FF) ||  // Miscellaneous Symbols (includes some emojis)
        (code >= 0x2700 && code <= 0x27BF) ||  // Dingbats
        (code >= 0x1F300 && code <= 0x1F9FF) || // Emoticons and Symbols
        (code >= 0x1F600 && code <= 0x1F64F) || // Emoticons
        (code >= 0x1F900 && code <= 0x1F9FF) || // Supplemental Symbols and Pictographs
        (code >= 0x1FA00 && code <= 0x1FAFF) || // Symbols and Pictographs Extended-A
        (code >= 0xFE00 && code <= 0xFE0F) ||   // Variation Selectors
        (code >= 0xFE20 && code <= 0xFE2F)) {   // Combining Half Marks
        result += content[i]
      }
      // Skip corrupted sequences but allow emojis
    }

    // Clean up multiple spaces (but preserve newlines)
    result = result.replace(/[ \t]+/g, ' ')  // Collapse spaces/tabs only
    result = result.replace(/\n{3,}/g, '\n\n')  // Limit consecutive newlines to 2

    return result
  }

  // Helper function to normalize timestamps from API response (JSON serializes Date to string)
  const normalizeConversation = (conversation: any): RAGConversation => {
    if (!conversation) return conversation

    // Helper to safely parse a timestamp - only converts if valid, otherwise preserves original
    const safeParseTimestamp = (ts: any): Date => {
      if (ts instanceof Date) {
        // Validate the Date object is not invalid
        return isNaN(ts.getTime()) ? ts : ts
      }
      if (!ts) {
        // If timestamp is missing, we can't recover it - but this shouldn't happen
        console.warn('[Normalize] Missing timestamp, this should not happen')
        return new Date(0) // Return epoch instead of current time to make it obvious
      }
      const parsed = new Date(ts)
      // Only use parsed date if it's valid
      if (!isNaN(parsed.getTime())) {
        return parsed
      }
      // If parsing failed, log warning but return epoch (not current time)
      console.warn('[Normalize] Failed to parse timestamp:', ts)
      return new Date(0) // Return epoch instead of current time
    }

    return {
      ...conversation,
      createdAt: safeParseTimestamp(conversation.createdAt),
      updatedAt: safeParseTimestamp(conversation.updatedAt),
      analyticsLastUpdated: conversation.analyticsLastUpdated
        ? safeParseTimestamp(conversation.analyticsLastUpdated)
        : undefined,
      messageHistory: Array.isArray(conversation.messageHistory)
        ? conversation.messageHistory.map((msg: any) => ({
          ...msg,
          timestamp: safeParseTimestamp(msg.timestamp)
        }))
        : []
    }
  }

  const loadConversations = async () => {
    const userId = localStorage.getItem("userId")
    if (!userId) return

    try {
      // Only load conversations if a class is selected
      if (!selectedClassId) {
        setConversations([])
        return
      }

      const { chatApi } = await import("@/lib/flask-api-client")
      const data = await chatApi.getConversations(userId, selectedClassId, chatType)
      console.log("[v0] Conversations API response:", data)

      // Ensure conversations is an array and normalize timestamps
      const conversations = Array.isArray(data.conversations) ? data.conversations : []
      // Normalize all conversations to convert timestamp strings to Date objects
      const normalizedConversations = conversations.map(conv => normalizeConversation(conv))
      // Sort in reverse chronological order (newest first) - ChatGPT style
      const sortedConversations = [...normalizedConversations].sort((a, b) => {
        const dateA = a.updatedAt instanceof Date ? a.updatedAt.getTime() :
          (a.updatedAt ? new Date(a.updatedAt).getTime() :
            (a.createdAt instanceof Date ? a.createdAt.getTime() :
              (a.createdAt ? new Date(a.createdAt).getTime() : 0)))
        const dateB = b.updatedAt instanceof Date ? b.updatedAt.getTime() :
          (b.updatedAt ? new Date(b.updatedAt).getTime() :
            (b.createdAt instanceof Date ? b.createdAt.getTime() :
              (b.createdAt ? new Date(b.createdAt).getTime() : 0)))
        return dateB - dateA // Descending order (newest first)
      })
      setConversations(sortedConversations)
    } catch (error) {
      console.error("[v0] Failed to load conversations:", error)
      setConversations([])
    }
  }

  const loadConversation = async (conversationId: string) => {
    try {
      console.log("[v0] Loading conversation:", conversationId)
      const { chatApi } = await import("@/lib/flask-api-client")
      const data = await chatApi.getConversation(conversationId)
      console.log("[v0] Loaded conversation data:", data)
      console.log("[v0] Conversation messageHistory:", data.conversation?.messageHistory)
      console.log("[v0] MessageHistory length:", data.conversation?.messageHistory?.length)
      // Normalize timestamps from strings to Date objects
      const normalizedConversation = normalizeConversation(data.conversation)
      setCurrentConversation(normalizedConversation)
      // Reset auto-scroll when loading a conversation
      shouldAutoScrollRef.current = true
      console.log("[v0] Current conversation set:", normalizedConversation?.id)
    } catch (error) {
      console.error("[v0] Failed to load conversation:", error)
    }
  }

  const createNewConversation = async () => {
    const userId = localStorage.getItem("userId")
    if (!userId) return

    if (!selectedClassId) {
      console.error("[v0] No class selected")
      return
    }

    try {
      const { chatApi } = await import("@/lib/flask-api-client")
      const data = await chatApi.createConversation({ userId, classId: selectedClassId, chatType, title: undefined })
      console.log("[v0] Created conversation response:", data)
      // Normalize timestamps from strings to Date objects
      const normalizedConversation = normalizeConversation(data.conversation)
      setCurrentConversation(normalizedConversation)
      // Reset auto-scroll when creating a new conversation
      shouldAutoScrollRef.current = true
      await loadConversations()
    } catch (error) {
      console.error("[v0] Failed to create conversation:", error)
    }
  }

  const deleteConversation = async (conversationId: string) => {
    if (!confirm("Are you sure you want to permanently delete this conversation? This action cannot be undone.")) {
      return
    }

    // Optimistically update UI immediately
    setConversations(prev => prev.filter(conv => conv.id !== conversationId))
    if (currentConversation?.id === conversationId) {
      setCurrentConversation(null)
    }

    try {
      const { chatApi } = await import("@/lib/flask-api-client")
      await chatApi.deleteConversation(conversationId)
      console.log("[v0] Conversation deleted successfully")
      // Don't reload - optimistic update is sufficient and maintains order
    } catch (error) {
      // Revert optimistic update on error
      console.error("[v0] Failed to delete conversation:", error)
      loadConversations() // Reload to restore correct state
    }
  }

  // Helper function to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  // Helper function to get file category
  const getFileCategory = (file: File): string => {
    if (file.type.startsWith('image/')) return 'Image'
    if (file.type === 'application/pdf') return 'PDF'
    if (file.type.includes('document') || file.type.includes('word')) return 'Document'

    // Check by file extension for better accuracy
    const ext = file.name.toLowerCase().split('.').pop() || ''
    if (ext === 'csv' || file.type === 'text/csv' || file.type === 'application/csv') return 'CSV'
    if (ext === 'json' || file.type === 'application/json') return 'JSON'
    if (ext === 'py' || file.type === 'text/x-python' || file.type === 'application/x-python-code') return 'Python'
    if (['js', 'jsx'].includes(ext) || file.type === 'text/javascript') return 'JavaScript'
    if (['ts', 'tsx'].includes(ext) || file.type === 'text/typescript') return 'TypeScript'
    if (ext === 'md' || file.type === 'text/x-markdown') return 'Markdown'
    if (ext === 'xml' || file.type === 'text/xml') return 'XML'
    if (ext === 'html' || file.type === 'text/html') return 'HTML'
    if (ext === 'css' || file.type === 'text/css') return 'CSS'
    if (['yaml', 'yml'].includes(ext) || file.type === 'text/yaml' || file.type === 'application/x-yaml') return 'YAML'
    if (file.type === 'text/plain' || ext === 'txt') return 'Text'

    return 'File'
  }

  // File Upload Handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    // Filter valid file types
    const validFiles = files.filter(file => {
      const validTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain', 'text/csv', 'application/csv', 'application/json',
        'text/x-python', 'application/x-python-code', 'text/javascript', 'text/typescript',
        'text/x-markdown', 'text/xml', 'text/html', 'text/css', 'text/yaml', 'application/x-yaml'
      ]
      return validTypes.includes(file.type) || file.name.match(/\.(jpg|jpeg|png|gif|webp|pdf|doc|docx|txt|csv|json|py|js|ts|jsx|tsx|md|xml|html|css|yaml|yml|sh|bat|log)$/i)
    })

    if (validFiles.length !== files.length) {
      // toast.error('Some files were skipped. Only images, PDFs, and documents are supported.')
    }

    if (validFiles.length === 0) return

    // Calculate persistent attachments already uploaded in this chat session
    const persistentCount = currentConversation?.cachedContext?.persistent_attachments?.length || 0;
    const currentAttachmentsCount = attachments.length;
    const totalAttemptedCount = persistentCount + currentAttachmentsCount + validFiles.length;

    if (totalAttemptedCount > 3) {
      toast.error('MAX Upload Limit reached (3). You cannot attach more documents to this chat.');

      // Calculate how many more *can* be added to reach exactly 3 (if any)
      const allowedCount = Math.max(0, 3 - (persistentCount + currentAttachmentsCount));
      if (allowedCount === 0) return;

      // Slice validFiles to only allow the remaining permitted amount
      validFiles.splice(allowedCount);
    }

    if (validFiles.length === 0) return;

    // Limit the current message attachments array
    const newFiles = [...attachments, ...validFiles]
    setAttachments(newFiles)

    // Generate previews for images
    const newPreviews: Array<{ file: File; preview: string }> = []
    validFiles.forEach(file => {
      if (file.type.startsWith('image/')) {
        const preview = URL.createObjectURL(file)
        newPreviews.push({ file, preview })
      } else {
        // For non-images, we still need an entry for consistency
        newPreviews.push({ file, preview: '' })
      }
    })
    setAttachmentPreviews(prev => [...prev, ...newPreviews].slice(0, 5))

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeAttachment = (index: number) => {
    const fileToRemove = attachments[index]
    setAttachments(prev => prev.filter((_, i) => i !== index))

    // Clean up preview URL if it's an image
    const previewIndex = attachmentPreviews.findIndex(p => p.file === fileToRemove)
    if (previewIndex !== -1) {
      const preview = attachmentPreviews[previewIndex].preview
      if (preview.startsWith('blob:')) {
        URL.revokeObjectURL(preview)
      }
      setAttachmentPreviews(prev => prev.filter((_, i) => i !== previewIndex))
    }
  }

  // Voice Input Handlers
  const startVoiceInput = async () => {
    voiceLogger.info('[Voice UI] 🎤 startVoiceInput called', { isVoiceSupported, isRecording })

    if (!isVoiceSupported) {
      voiceLogger.warn('[Voice UI] ❌ Voice not supported')
      return
    }

    if (isRecording) {
      voiceLogger.info('[Voice UI] ⏹️ Already recording, stopping...')
      stopVoiceInput()
      return
    }

    // Store the current input as base before starting
    baseInputRef.current = input
    voiceLogger.info('[Voice UI] 📝 Base input stored', {
      base: baseInputRef.current.substring(0, 50),
      baseLength: baseInputRef.current.length
    })
    setIsRecording(true)

    try {
      voiceLogger.info('[Voice UI] 🚀 Starting speech recognition...')
      await speechToText.start(
        (result) => {
          voiceLogger.info('[Voice UI] 📨 Result callback', {
            isFinal: result.isFinal,
            transcript: result.transcript.substring(0, 50),
            length: result.transcript.length
          })

          if (result.isFinal) {
            // Final result - append to CURRENT base input (not accumulated)
            // The baseInputRef should already have all previous final results
            const currentBase = baseInputRef.current || ''

            // Check if this transcript is already in the base to prevent duplicates
            const transcriptLower = result.transcript.trim().toLowerCase()
            const baseLower = currentBase.toLowerCase()

            // Only append if this transcript is not already in the base
            let newText: string
            if (currentBase && baseLower.includes(transcriptLower)) {
              // Transcript already exists in base, don't duplicate
              voiceLogger.info('[Voice UI] ⚠️ Final result already in base, skipping duplicate', {
                base: currentBase.substring(0, 50),
                transcript: result.transcript.substring(0, 30)
              })
              newText = currentBase // Keep existing base
            } else {
              // New transcript, append it
              newText = currentBase
                ? `${currentBase} ${result.transcript}`.trim()
                : result.transcript.trim()
              voiceLogger.info('[Voice UI] ✅ Final result - appending to base', {
                base: currentBase.substring(0, 30),
                new: result.transcript.substring(0, 30),
                combined: newText.substring(0, 50)
              })
            }

            setInput(newText)
            baseInputRef.current = newText // Update base for next final result
            // DON'T stop here - keep listening in continuous mode
            // Only stop when user clicks stop button
          } else {
            // Interim result - show base input + latest interim (will be replaced by next interim or final)
            const currentBase = baseInputRef.current || ''
            const displayText = currentBase
              ? `${currentBase} ${result.transcript}`.trim()
              : result.transcript.trim()
            voiceLogger.info('[Voice UI] ⏳ Interim result - showing', {
              base: currentBase.substring(0, 30),
              interim: result.transcript.substring(0, 30),
              display: displayText.substring(0, 50)
            })
            setInput(displayText)
            // DON'T update baseInputRef for interim results - only for final
          }
        },
        (error) => {
          voiceLogger.error('[Voice UI] ❌ Error callback', { error })
          setIsRecording(false)
          // Restore base input on error
          setInput(baseInputRef.current)
        },
        {
          continuous: true, // Keep listening until stopped
          interimResults: true,
          lang: 'en-US'
        }
      )
      voiceLogger.info('[Voice UI] ✅ Speech recognition started successfully')
    } catch (error: any) {
      voiceLogger.error('[Voice UI] ❌ Exception starting recognition', { error })
      setIsRecording(false)
      setInput(baseInputRef.current)
    }
  }

  const stopVoiceInput = () => {
    voiceLogger.info('[Voice UI] 🛑 stopVoiceInput called', { isRecording })
    if (isRecording) {
      // Don't immediately stop - wait a bit for final results to come through
      // The recognition will finalize any pending results when stopped
      setTimeout(() => {
        speechToText.stop()
        setIsRecording(false)
        voiceLogger.info('[Voice UI] ✅ Recording stopped')
        // Finalize any interim results by updating baseInputRef
        // The current input may have interim results that need to be finalized
        if (input && input !== baseInputRef.current) {
          // If input has changed, it might have interim results
          // Wait a bit more for final results, then update base
          setTimeout(() => {
            baseInputRef.current = input
            voiceLogger.info('[Voice UI] 📝 Finalized input after stop', { final: input.substring(0, 50) })
          }, 500)
        }
      }, 300) // Small delay to allow final results to process
    }
  }

  // Toggle Deep Thinking Mode
  const toggleDeepThinking = () => {
    setDeepThinking(prev => !prev)
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userId = localStorage.getItem("userId")
    if (!userId) return

    if (!currentConversation) {
      console.log("[v0] No current conversation, creating new one")
      await createNewConversation()
      return
    }

    console.log("[v0] Sending message with conversation ID:", currentConversation.id)
    const userMessage = input.trim()
    const messageAttachments = attachments // Store attachments before clearing
    setInput("")
    setAttachments([])
    // Clean up preview URLs
    attachmentPreviews.forEach(({ preview }) => {
      if (preview.startsWith('blob:')) {
        URL.revokeObjectURL(preview)
      }
    })
    setAttachmentPreviews([])
    // Reset textarea height after clearing input
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    setLoading(true)
    // Reset auto-scroll when sending a new message
    shouldAutoScrollRef.current = true

    // If Deep Thinking Mode is enabled, show animation
    if (deepThinking) {
      setIsDeepThinking(true)
      // Scroll to show the animation immediately
      setTimeout(() => {
        if (scrollRef.current) {
          isScrollingProgrammaticallyRef.current = true
          scrollRef.current.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth'
          })
          shouldAutoScrollRef.current = true
          setTimeout(() => {
            isScrollingProgrammaticallyRef.current = false
          }, 500)
        }
      }, 100) // Small delay to ensure user message is rendered
    }

    // Track time to first token (TTFT)
    const sendTimestamp = Date.now()
    let firstTokenTimestamp: number | null = null

    // Add user message to conversation immediately for instant display
    const userMessageObj = {
      role: "user" as const,
      content: userMessage,
      timestamp: new Date(),
      metadata: {},
      attachments: messageAttachments.length > 0 ? messageAttachments.map(file => ({
        type: (file.type.startsWith('image/') ? 'image' : 'file') as 'image' | 'file',
        url: '', // Will be set by backend after upload
        name: file.name,
        mimeType: file.type,
        size: file.size
      })) : undefined
    }

    // Update current conversation state immediately
    setCurrentConversation(prev => {
      if (!prev) return prev
      return {
        ...prev,
        messageHistory: [...(prev.messageHistory || []), userMessageObj]
      }
    })

    // Force smooth scroll to bottom immediately after adding user message
    // If Deep Thinking Mode is enabled, scroll will happen again when animation appears
    setTimeout(() => {
      if (scrollRef.current) {
        isScrollingProgrammaticallyRef.current = true
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: 'smooth'
        })
        shouldAutoScrollRef.current = true
        setTimeout(() => {
          isScrollingProgrammaticallyRef.current = false
        }, 500) // Increased timeout to account for smooth scroll animation
      }
    }, 0)

    // If Deep Thinking Mode is enabled, scroll again when animation appears
    if (deepThinking) {
      // Scroll after a short delay to ensure animation is rendered
      setTimeout(() => {
        if (scrollRef.current) {
          isScrollingProgrammaticallyRef.current = true
          scrollRef.current.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth'
          })
          setTimeout(() => {
            isScrollingProgrammaticallyRef.current = false
          }, 500)
        }
      }, 200) // Small delay to ensure animation component is rendered
    }

    try {
      console.log("[v0] Starting fetch request to /api/chat/ai-response")
      console.log("[v0] Request body:", { message: userMessage, userId, sessionId: currentConversation.id })

      // Capture timestamp BEFORE sending request - this will be used for the assistant message
      const assistantMessageTimestamp = new Date()

      // Send message and get AI response with timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 120000) // 2 minute timeout

      // If Deep Thinking Mode is enabled, add a 3-second artificial delay *before* sending the request
      if (deepThinking) {
        console.log("[v0] 🧠 Deep Thinking Mode active: delaying request by 3000ms")
        await new Promise(resolve => setTimeout(resolve, 3000))
      }

      // Prepare FormData if we have attachments, otherwise use JSON
      let requestBody: FormData | string
      let headers: HeadersInit

      if (messageAttachments.length > 0) {
        // Use FormData for file uploads
        const formData = new FormData()
        formData.append('message', userMessage)
        formData.append('userId', userId)
        formData.append('sessionId', currentConversation.id)
        if (selectedClassId) formData.append('classId', selectedClassId)
        formData.append('chatType', chatType)
        formData.append('preferredModel', preferredModel)
        formData.append('stream', 'true')
        formData.append('deepThinking', deepThinking.toString())
        formData.append('assistantMessageTimestamp', assistantMessageTimestamp.toISOString())

        messageAttachments.forEach((file) => {
          formData.append(`attachments`, file)
        })

        requestBody = formData
        headers = {} // Let browser set Content-Type for FormData
      } else {
        // Use JSON for text-only messages
        requestBody = JSON.stringify({
          message: userMessage,
          userId,
          sessionId: currentConversation.id,
          classId: selectedClassId,
          chatType: chatType,
          preferredModel: preferredModel,
          stream: true,
          deepThinking: deepThinking,
          assistantMessageTimestamp: assistantMessageTimestamp.toISOString()
        })
        headers = { "Content-Type": "application/json" }
      }

      // Use Flask API client for non-streaming, direct fetch for streaming
      const { chatApi } = await import("@/lib/flask-api-client")
      const FLASK_API_URL = process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://localhost:5000'

      let response: Response
      // Always use streaming mode since we set stream: true in request body
      const useStreaming = true
      if (useStreaming) {
        // For streaming, use direct fetch
        const sessionId = localStorage.getItem('sessionId')
        const fetchHeaders: HeadersInit = {}
        // Only set Content-Type for JSON; omit for FormData so browser sets multipart/form-data with boundary
        if (messageAttachments.length === 0) {
          fetchHeaders["Content-Type"] = "application/json"
        }
        if (sessionId) {
          fetchHeaders['X-Session-Id'] = sessionId
        }

        response = await fetch(`${FLASK_API_URL}/api/chat/ai-response`, {
          method: "POST",
          headers: fetchHeaders,
          body: requestBody,
          signal: controller.signal
        })
      } else {
        // For non-streaming, use API client
        const result = await chatApi.sendMessage({
          userId,
          sessionId: currentConversation.id,
          message: userMessage,
          classId: selectedClassId,
          chatType,
          preferredModel,
          stream: false,
          deepThinking,
        })

        // Handle non-streaming response (similar to student-chat-interface)
        if (result.response) {
          const userMessageTimestampNow = new Date()
          const userMessageObj = {
            role: "user" as const,
            content: userMessage,
            timestamp: userMessageTimestampNow,
          }

          const assistantMessageObj = {
            role: "assistant" as const,
            content: result.response,
            timestamp: assistantMessageTimestamp,
            metadata: {
              modelUsed: result.modelUsed || preferredModel,
              timeTaken: result.timeTaken || 0,
              success: true
            }
          }

          setCurrentConversation(prev => {
            if (!prev) return prev
            return {
              ...prev,
              messageHistory: [...(prev.messageHistory || []), userMessageObj, assistantMessageObj]
            }
          })

          setLoading(false)
          return
        }

        // Fallback to fetch if API client doesn't handle it
        const sessionId = localStorage.getItem('sessionId')
        const fetchHeaders: HeadersInit = {}
        if (messageAttachments.length === 0) {
          fetchHeaders["Content-Type"] = "application/json"
        }
        if (sessionId) {
          fetchHeaders['X-Session-Id'] = sessionId
        }

        response = await fetch(`${FLASK_API_URL}/api/chat/ai-response`, {
          method: "POST",
          headers: fetchHeaders,
          body: requestBody,
          signal: controller.signal
        })
      }

      clearTimeout(timeoutId)
      console.log("[v0] Fetch request started, status:", response.status)

      if (response.ok) {
        // Check if response is streaming (SSE)
        const contentType = response.headers.get('content-type')

        // ── Queue Mode: API returned JSON with taskId ──────────────
        if (contentType?.includes('application/json')) {
          const jsonData = await response.json()

          if (jsonData.taskId) {
            console.log("[v0] 🚀 Queue mode: task", jsonData.taskId, "queued. Opening SSE stream...")

            const streamController = new AbortController()
            const streamTimeoutId = setTimeout(() => streamController.abort(), 150000)

            const streamResponse = await fetch(`${FLASK_API_URL}/api/chat/stream/${jsonData.taskId}`, {
              method: "GET",
              headers: { 'Accept': 'text/event-stream' },
              signal: streamController.signal,
            })

            clearTimeout(streamTimeoutId)

            if (!streamResponse.ok) {
              throw new Error(`Stream endpoint returned ${streamResponse.status}`)
            }

            // Re-assign response so the existing SSE parsing code below handles it
            response = streamResponse
          } else {
            // Non-queued JSON response (sync fallback, non-streaming)
            console.log("[v0] ⚠️ Non-streaming JSON response:", jsonData)
            setIsDeepThinking(false)
            await loadConversation(currentConversation.id)
            await loadConversations()
            setLoading(false)
            return
          }
        }

        // ── SSE Streaming (works for both queue-mode SSE and direct SSE) ──
        if (response.headers.get('content-type')?.includes('text/event-stream')) {
          console.log("[v0] Streaming response detected")

          // Create placeholder for assistant message - use the same timestamp we sent to backend
          const assistantMessageObj = {
            role: "assistant" as const,
            content: "",
            timestamp: assistantMessageTimestamp,
            metadata: { timeToFirstToken: null }
          }

          // Add empty assistant message that we'll update
          setCurrentConversation(prev => {
            if (!prev) return prev
            return {
              ...prev,
              messageHistory: [...(prev.messageHistory || []), assistantMessageObj]
            }
          })

          // Hide loading indicator now that we're streaming the response
          setLoading(false)

          // Read the stream
          const reader = response.body?.getReader()
          const decoder = new TextDecoder()
          let accumulatedResponse = '' // Declare outside the if block so it's accessible later
          let capturedModelUsed: string | undefined = undefined // Capture modelUsed from done event

          if (reader) {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              const chunk = decoder.decode(value)
              const lines = chunk.split('\n').filter(line => line.trim() !== '')

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6))

                    if (data.content) {
                      // Sanitize content immediately to remove corrupted emojis
                      const sanitizedChunk = sanitizeContentChunk(data.content)

                      // Track time to first token (only once)
                      if (firstTokenTimestamp === null && sanitizedChunk.trim()) {
                        firstTokenTimestamp = Date.now()
                        const ttft = firstTokenTimestamp - sendTimestamp
                        console.log(`[v0] ⚡ Time to First Token: ${ttft}ms`)

                        // Hide Deep Thinking animation when stream starts
                        setIsDeepThinking(false)
                      }

                      accumulatedResponse += sanitizedChunk

                      // Update the last message (assistant) with new content
                      setCurrentConversation(prev => {
                        if (!prev) return prev
                        const messages = [...(prev.messageHistory || [])]
                        if (messages.length > 0) {
                          const ttft = firstTokenTimestamp ? firstTokenTimestamp - sendTimestamp : null
                          messages[messages.length - 1] = {
                            ...messages[messages.length - 1],
                            content: accumulatedResponse,
                            metadata: {
                              ...messages[messages.length - 1].metadata,
                              timeToFirstToken: ttft
                            }
                          }
                        }
                        return { ...prev, messageHistory: messages }
                      })

                      // Auto-scroll only if user is at bottom - always check position during streaming
                      if (scrollRef.current) {
                        const element = scrollRef.current
                        // Always check if user is at bottom - if they scrolled back down, resume auto-scroll
                        if (isNearBottom(element)) {
                          // Re-enable auto-scroll if user is back at bottom
                          shouldAutoScrollRef.current = true
                          requestAnimationFrame(() => {
                            if (scrollRef.current && isNearBottom(scrollRef.current)) {
                              isScrollingProgrammaticallyRef.current = true
                              scrollRef.current.scrollTo({
                                top: scrollRef.current.scrollHeight,
                                behavior: 'smooth'
                              })
                              // Reset flag after smooth scroll animation
                              setTimeout(() => {
                                isScrollingProgrammaticallyRef.current = false
                              }, 500)
                            }
                          })
                        } else {
                          // User has scrolled up, disable auto-scroll
                          shouldAutoScrollRef.current = false
                        }
                      }
                    }

                    if (data.done) {
                      console.log("[v0] Streaming completed, modelUsed:", data.modelUsed, "Final content length:", accumulatedResponse.length)

                      // Capture modelUsed from done event
                      if (data.modelUsed) {
                        capturedModelUsed = data.modelUsed
                      }

                      // Use the formatted response from the done event (includes emojis)
                      // If data.content is provided, it's the final formatted response from Python
                      const finalFormattedContent = data.content || accumulatedResponse

                      console.log("[v0] Final formatted content length:", finalFormattedContent.length)
                      console.log("[v0] Final formatted content preview:", finalFormattedContent.substring(0, 200))

                      // Update the message with the final formatted content (includes emojis)
                      setCurrentConversation(prev => {
                        if (!prev) return prev
                        const messages = [...(prev.messageHistory || [])]
                        if (messages.length > 0) {
                          const lastMsg = messages[messages.length - 1]
                          if (lastMsg.role === 'assistant') {
                            messages[messages.length - 1] = {
                              ...lastMsg,
                              content: finalFormattedContent, // Use formatted response with emojis
                              metadata: {
                                ...lastMsg.metadata,
                                modelUsed: capturedModelUsed || lastMsg.metadata?.modelUsed
                              }
                            }
                          }
                        }
                        return { ...prev, messageHistory: messages }
                      })

                      // Update accumulatedResponse for consistency
                      accumulatedResponse = finalFormattedContent

                      // Don't break here - continue reading until stream is done
                      // The break will happen when reader.read() returns done=true
                    }
                  } catch (e) {
                    console.error("[v0] Failed to parse SSE data:", e)
                  }
                }
              }
            }
          }

          // Calculate total response time (send to last token)
          const lastTokenTimestamp = Date.now()
          const totalResponseTime = lastTokenTimestamp - sendTimestamp
          const ttft = firstTokenTimestamp ? firstTokenTimestamp - sendTimestamp : null
          console.log(`[v0] 📊 Total Response Time: ${totalResponseTime}ms`)

          // Update the final message with metadata - NO RELOAD to prevent timestamp blink
          // The backend already saved the message, we just need to update metadata in state
          setCurrentConversation(prev => {
            if (!prev?.messageHistory) return prev
            const messages = [...prev.messageHistory]
            if (messages.length > 0) {
              const lastMsg = messages[messages.length - 1]
              if (lastMsg.role === 'assistant') {
                // Update metadata but preserve the original timestamp to prevent blink
                messages[messages.length - 1] = {
                  ...lastMsg,
                  // Content is already updated during streaming, just update metadata
                  metadata: {
                    ...lastMsg.metadata,
                    timeToFirstToken: ttft,
                    totalResponseTime: totalResponseTime,
                    modelUsed: capturedModelUsed || lastMsg.metadata?.modelUsed
                  }
                }
              }
            }
            return { ...prev, messageHistory: messages }
          })

          // Silently refresh conversations list in background (don't reload current conversation to avoid blink)
          loadConversations().catch(err => console.error("[v0] Failed to refresh conversations list:", err))
        } else {
          // Non-streaming response (fallback)
          setIsDeepThinking(false)
          const responseData = await response.json()
          console.log("[v0] Non-streaming AI response received:", responseData)

          // Reload the conversation to get the complete updated messages from database
          console.log("[v0] Reloading conversation:", currentConversation.id)
          await loadConversation(currentConversation.id)
          await loadConversations()
          console.log("[v0] Conversation reloaded successfully")
        }
      } else {
        setIsDeepThinking(false)
        console.error("[v0] Failed to get AI response:", response.status, response.statusText)
        const errorText = await response.text()
        console.error("[v0] Error response body:", errorText)
      }
    } catch (error) {
      console.error("[v0] Failed to send message:", error)
      if (error instanceof Error && error.name === 'AbortError') {
        console.error("[v0] Request timed out after 2 minutes")
      }
    } finally {
      setLoading(false)
      setIsDeepThinking(false)
    }
  }

  const exportChat = () => {
    if (!currentConversation) {
      alert("No conversation to export")
      return
    }

    // Get class name
    const className = selectedClassId === 'entire-corpus'
      ? 'Entire Corpus'
      : classes.find(c => c.id === selectedClassId)?.name || 'Unknown Class'

    // Format chat type
    const chatTypeFormatted = chatType === 'class_material' ? 'Class Material' : 'Syllabus/Schedule'

    // Format date and time
    const startDate = new Date(currentConversation.createdAt)
    const formattedDate = startDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    const formattedTime = startDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })

    // Build the export content
    let exportContent = `LearnBOT Chat Export\n`
    exportContent += `${'='.repeat(80)}\n\n`
    exportContent += `Faculty: ${userName}\n`
    exportContent += `Class: ${className}\n`
    exportContent += `Chat Type: ${chatTypeFormatted}\n`
    exportContent += `Date Started: ${formattedDate}\n`
    exportContent += `Time Started: ${formattedTime}\n`
    exportContent += `Conversation Title: ${currentConversation.title}\n`
    exportContent += `\n${'='.repeat(80)}\n\n`

    // Add messages
    if (currentConversation.messageHistory && currentConversation.messageHistory.length > 0) {
      currentConversation.messageHistory.forEach((message, index) => {
        const role = message.role === 'user' ? '[USER]' : '[AI TA]'
        let timestampDisplay = '--:--'
        try {
          const date = new Date(message.timestamp as any)
          const timeValue = date.getTime()
          if (!isNaN(timeValue) && timeValue !== 0) {
            timestampDisplay = date.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            })
          }
        } catch {
          // leave timestampDisplay as '--:--'
        }

        exportContent += `${role} (${timestampDisplay})\n`
        exportContent += `${message.content}\n\n`

        // Add separator between messages (except last one)
        if (index < currentConversation.messageHistory.length - 1) {
          exportContent += `${'-'.repeat(80)}\n\n`
        }
      })
    } else {
      exportContent += `No messages in this conversation.\n`
    }

    exportContent += `\n${'='.repeat(80)}\n`
    exportContent += `End of Chat Export\n`
    exportContent += `Total Messages: ${currentConversation.messageHistory?.length || 0}\n`

    // Create blob and download
    const blob = new Blob([exportContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url

    // Create filename: LearnBOT_ClassName_Date_Time.txt
    const sanitizedClassName = className.replace(/[^a-z0-9]/gi, '_')
    const dateStr = startDate.toISOString().split('T')[0]
    const timeStr = startDate.toTimeString().split(' ')[0].replace(/:/g, '-')
    link.download = `LearnBOT_${sanitizedClassName}_${dateStr}_${timeStr}.txt`

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [input])

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
    // Shift+Enter allows new lines, so we don't prevent default
  }

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed)
  }

  return (
    <div className="h-full flex overflow-hidden relative">
      {/* Collapsed Sidebar Toggle Button - Only show when collapsed */}
      {isSidebarCollapsed && (
        <Button
          size="icon"
          variant="ghost"
          onClick={toggleSidebar}
          className={`absolute top-4 left-4 z-20 shadow-md ${isDarkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700' : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'}`}
          title="Show sidebar"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      )}

      {/* Chat History Sidebar */}
      <div className={`${isSidebarCollapsed ? 'w-0' : 'w-80'} border-r bg-card transition-all duration-300 ease-in-out overflow-hidden flex flex-col relative ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        {/* Sidebar Toggle Button - Positioned on the right edge when expanded */}
        {!isSidebarCollapsed && (
          <Button
            size="icon"
            variant="ghost"
            onClick={toggleSidebar}
            className={`absolute top-4 right-2 z-20 ${isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-700'}`}
            title="Hide sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}

        <div className="p-4 overflow-y-auto flex-1">
          <div className="space-y-4 mb-4">
            {/* Model Selection */}
            <div className="space-y-2">
              <label className={`text-sm font-medium flex items-center gap-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>
                <Zap className={`h-4 w-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                Select Model
              </label>
              <Select value={preferredModel} onValueChange={(value) => setPreferredModel(value as ModelBackend)}>
                <SelectTrigger className={isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : ''}>
                  <SelectValue placeholder="Choose a model..." />
                </SelectTrigger>
                <SelectContent className={isDarkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : ''}>
                  <SelectItem
                    value="claude"
                    disabled
                    className={`${isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100 text-gray-500' : 'text-gray-400'} cursor-not-allowed`}
                  >
                    🧠 Claude (temporarily unavailable)
                  </SelectItem>
                  <SelectItem value="remote-blackwell" className={isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100' : ''}>
                    ⚡ Gemma (Blackwell)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* TA Mode Selection */}
            <div className="space-y-2">
              <label className={`text-sm font-medium flex items-center gap-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>
                <Bot className={`h-4 w-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                TA Mode
              </label>
              <div className={`flex gap-1 p-1 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                <button
                  type="button"
                  onClick={async () => {
                    const newMode: 'lenient' | 'normal' | 'strict' = 'lenient'
                    setTaMode(newMode)
                    const userId = localStorage.getItem("userId")
                    if (userId) {
                      try {
                        const { usersApi } = await import("@/lib/flask-api-client")
                        await usersApi.updateTaMode(userId, newMode)
                      } catch (error) {
                        console.error('Failed to update TA mode:', error)
                      }
                    }
                  }}
                  className={`flex-1 px-3 py-2 text-xs font-medium rounded transition-colors ${taMode === 'lenient'
                    ? isDarkMode
                      ? 'bg-green-600 text-white'
                      : 'bg-green-500 text-white'
                    : isDarkMode
                      ? 'text-gray-300 hover:bg-gray-600'
                      : 'text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  Lenient
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const newMode: 'lenient' | 'normal' | 'strict' = 'normal'
                    setTaMode(newMode)
                    const userId = localStorage.getItem("userId")
                    if (userId) {
                      try {
                        const { usersApi } = await import("@/lib/flask-api-client")
                        await usersApi.updateTaMode(userId, newMode)
                      } catch (error) {
                        console.error('Failed to update TA mode:', error)
                      }
                    }
                  }}
                  className={`flex-1 px-3 py-2 text-xs font-medium rounded transition-colors ${taMode === 'normal'
                    ? isDarkMode
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-500 text-white'
                    : isDarkMode
                      ? 'text-gray-300 hover:bg-gray-600'
                      : 'text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  Normal
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const newMode: 'lenient' | 'normal' | 'strict' = 'strict'
                    setTaMode(newMode)
                    const userId = localStorage.getItem("userId")
                    if (userId) {
                      try {
                        const { usersApi } = await import("@/lib/flask-api-client")
                        await usersApi.updateTaMode(userId, newMode)
                      } catch (error) {
                        console.error('Failed to update TA mode:', error)
                      }
                    }
                  }}
                  className={`flex-1 px-3 py-2 text-xs font-medium rounded transition-colors ${taMode === 'strict'
                    ? isDarkMode
                      ? 'bg-red-600 text-white'
                      : 'bg-red-500 text-white'
                    : isDarkMode
                      ? 'text-gray-300 hover:bg-gray-600'
                      : 'text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  Strict
                </button>
              </div>
              <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {taMode === 'lenient' && 'More forgiving - accepts partial understanding'}
                {taMode === 'normal' && 'Balanced - standard checkpoint requirements'}
                {taMode === 'strict' && 'Very strict - requires complete, precise understanding'}
              </p>
            </div>

            {/* Class Selection */}
            <div className="space-y-2">
              <label className={`text-sm font-medium flex items-center gap-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>
                <BookOpen className={`h-4 w-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                Select Class
              </label>
              <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                <SelectTrigger className={isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : ''}>
                  <SelectValue placeholder="Choose a class..." />
                </SelectTrigger>
                <SelectContent className={isDarkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : ''}>
                  {/* Entire Corpus Option */}
                  <SelectItem value="entire-corpus" className={isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100' : ''}>
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>📚 Entire Corpus</span>
                    </div>
                  </SelectItem>
                  {classes.length > 0 && (
                    <div className={`px-2 py-1.5 text-xs font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Individual Classes
                    </div>
                  )}
                  {classes.map((classItem) => (
                    <SelectItem key={classItem.id} value={classItem.id} className={isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100' : ''}>
                      {classItem.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Chat Type Selection */}
            <div className="space-y-2">
              <label className={`text-sm font-medium flex items-center gap-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>
                Chat Type
              </label>
              <Select value={chatType} onValueChange={(val) => setChatType(val as ChatType)}>
                <SelectTrigger className={isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={isDarkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : ''}>
                  <SelectItem value="class_material" className={isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100' : ''}>
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4" />
                      <span>Class Material</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="syllabus" className={isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100' : ''}>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>Syllabus/Schedule</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Chat Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className={`font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>My Chats</h2>
              </div>
              <Button size="sm" onClick={createNewConversation} disabled={!selectedClassId}>
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
            </div>
          </div>
          <div className="mt-4 flex-1 overflow-y-auto">
            <div className="space-y-2 pr-2">
              {!selectedClassId ? (
                <div className="text-center py-8">
                  <BookOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground mb-2">Select a class to view conversations</p>
                  <p className="text-xs text-muted-foreground">Choose a class from the dropdown above to see its chat history</p>
                </div>
              ) : !conversations || conversations.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground mb-2">No conversations yet for this class</p>
                  <p className="text-xs text-muted-foreground">Start a new conversation to begin chatting</p>
                </div>
              ) : (
                conversations.map((conversation) => (
                  <Card
                    key={conversation.id}
                    className={`p-3 cursor-pointer hover:bg-accent transition-colors group ${currentConversation?.id === conversation.id ? "bg-accent" : ""
                      }`}
                    onClick={() => loadConversation(conversation.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="font-medium text-sm truncate w-full">{getConversationCardTitle(conversation)}</p>
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {new Date(conversation.updatedAt).toLocaleDateString()} • {conversation.messageHistory?.length ?? 0} messages
                        </p>
                        {conversation.currentTopic && (
                          <p className="text-xs text-indigo-600 mt-1 truncate">Topic: {conversation.currentTopic}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 text-red-600 hover:text-red-700"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteConversation(conversation.id)
                        }}
                        title="Delete conversation permanently"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative transition-all duration-300 ease-in-out">
        {/* Export Chat Button - Only show when there's an active conversation */}
        {currentConversation && (
          <Button
            size="sm"
            variant="ghost"
            onClick={exportChat}
            className={`absolute top-4 right-4 z-10 shadow-md rounded-lg border gap-2 ${isDarkMode ? 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-100' : 'bg-white border-gray-200 hover:bg-gray-100 text-gray-900'}`}
            title="Export chat as text file"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export Chat</span>
          </Button>
        )}

        {!currentConversation ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <div className={`p-4 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center ${isDarkMode ? 'bg-indigo-900/50' : 'bg-indigo-100'}`}>
                <MessageSquare className={`h-10 w-10 ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
              </div>
              <h2 className={`text-2xl font-bold mb-3 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Start a New Conversation</h2>
              {isCheckingCorpus ? (
                <p className={`mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Checking corpus...
                </p>
              ) : hasCorpusPdfs === false && selectedClassId && selectedClassId !== 'entire-corpus' ? (
                <>
                  <p className={`mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    No PDFs have been uploaded for this class yet. Please upload and index course materials before you can start chatting.
                  </p>
                  <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-yellow-900/20 border border-yellow-700/50' : 'bg-yellow-50 border border-yellow-200'}`}>
                    <p className={`text-sm ${isDarkMode ? 'text-yellow-300' : 'text-yellow-800'}`}>
                      📚 Chat is disabled until course materials (PDFs) are uploaded and indexed. Go to Corpus Management to upload PDFs.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <p className={`mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    {selectedClassId
                      ? `Use the AI assistant to help with ${classes.find(c => c.id === selectedClassId)?.name || 'this class'}`
                      : "Select a class to start chatting with the AI assistant"
                    }
                  </p>
                  <Button size="lg" onClick={createNewConversation} disabled={!selectedClassId || hasCorpusPdfs === false}>
                    <Plus className="h-5 w-5 mr-2" />
                    New Chat
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className={`flex-1 overflow-y-auto p-6 ${isDarkMode ? 'bg-black' : 'bg-white'}`} ref={scrollRef}>
              <div className="max-w-4xl mx-auto space-y-6">
                {!currentConversation || !currentConversation.messageHistory || currentConversation.messageHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className={`w-16 h-16 rounded-full ${isDarkMode ? 'bg-white/5 border border-white/10' : 'bg-gray-100'} flex items-center justify-center mb-4`}>
                      <MessageSquare className={`w-8 h-8 ${isDarkMode ? 'text-white/40' : 'text-gray-400'}`} />
                    </div>
                    <p className={`text-lg font-medium ${isDarkMode ? 'text-white/60' : 'text-gray-600'}`}>
                      Start a conversation
                    </p>
                    <p className={`text-sm ${isDarkMode ? 'text-white/40' : 'text-gray-500'} mt-2`}>
                      Send a message to begin
                    </p>
                  </div>
                ) : (
                  currentConversation.messageHistory.map((message, index) => {
                    // Don't render empty assistant messages while Deep Thinking animation is active
                    if (message.role === 'assistant' && message.content.trim() === '' && isDeepThinking) {
                      return null
                    }
                    return (
                      <ChatMessage
                        key={index}
                        role={message.role}
                        content={message.content}
                        timestamp={message.timestamp}
                        metadata={message.metadata}
                        attachments={message.attachments}
                        isDarkMode={isDarkMode}
                      />
                    )
                  })
                )}
                {isDeepThinking && (
                  <DeepThinkingAnimation isDarkMode={isDarkMode} />
                )}
                {loading && !isDeepThinking && (
                  <div className="flex gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex-shrink-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDarkMode
                        ? 'bg-white/10 border border-white/20'
                        : 'bg-gradient-to-br from-emerald-400 to-teal-500'
                        } shadow-lg`}>
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <div className={`flex-1 max-w-[85%] rounded-2xl px-5 py-4 ${isDarkMode
                      ? 'bg-transparent'
                      : 'bg-white border border-gray-200'
                      } shadow-lg`}>
                      <div className="flex gap-2">
                        <div className={`w-2 h-2 rounded-full animate-bounce ${isDarkMode ? 'bg-white/40' : 'bg-gray-400'}`}></div>
                        <div className={`w-2 h-2 rounded-full animate-bounce ${isDarkMode ? 'bg-white/40' : 'bg-gray-400'}`} style={{ animationDelay: '0.2s' }}></div>
                        <div className={`w-2 h-2 rounded-full animate-bounce ${isDarkMode ? 'bg-white/40' : 'bg-gray-400'}`} style={{ animationDelay: '0.4s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t bg-card p-4">
              <div className="max-w-3xl mx-auto">
                {/* Attachment Previews */}
                {attachmentPreviews.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-3">
                    {attachmentPreviews.map(({ file, preview }, index) => {
                      const isImage = file.type.startsWith('image/')
                      const category = getFileCategory(file)
                      const fileSize = formatFileSize(file.size)

                      return (
                        <div
                          key={index}
                          className={`relative group rounded-lg border overflow-hidden transition-all hover:shadow-md ${isDarkMode
                            ? 'bg-gray-900 border-gray-700'
                            : 'bg-white border-gray-300'
                            }`}
                          style={{ width: isImage ? '140px' : '200px' }}
                        >
                          {isImage ? (
                            <>
                              {/* Image Thumbnail */}
                              <div className="relative w-full h-32 bg-gray-100">
                                <img
                                  src={preview}
                                  alt={file.name}
                                  className="w-full h-full object-cover"
                                />
                                {/* Category Badge */}
                                <div className="absolute top-2 left-2">
                                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${isDarkMode
                                    ? 'bg-blue-600/90 text-white'
                                    : 'bg-blue-500 text-white'
                                    }`}>
                                    {category}
                                  </span>
                                </div>
                                {/* Remove Button */}
                                <button
                                  onClick={() => removeAttachment(index)}
                                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                  aria-label="Remove attachment"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              {/* Image Info */}
                              <div className={`p-2 ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
                                <p className={`text-xs font-medium truncate mb-0.5 ${isDarkMode ? 'text-white' : 'text-gray-900'
                                  }`}>
                                  {file.name}
                                </p>
                                <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'
                                  }`}>
                                  {fileSize}
                                </p>
                              </div>
                            </>
                          ) : (
                            <>
                              {/* Document Preview */}
                              <div className={`p-2 ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
                                <div className="flex items-center gap-2">
                                  {/* File Icon */}
                                  <div className={`flex-shrink-0 w-8 h-8 rounded flex items-center justify-center ${isDarkMode
                                    ? 'bg-gray-800 border border-gray-700'
                                    : 'bg-gray-100 border border-gray-200'
                                    }`}>
                                    <File className={`h-4 w-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                      }`} />
                                  </div>
                                  {/* File Info */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                      <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${isDarkMode
                                        ? 'bg-purple-600/90 text-white'
                                        : 'bg-purple-500 text-white'
                                        }`}>
                                        {category}
                                      </span>
                                    </div>
                                    <p className={`text-xs font-medium truncate ${isDarkMode ? 'text-white' : 'text-gray-900'
                                      }`}>
                                      {file.name}
                                    </p>
                                    <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'
                                      }`}>
                                      {fileSize}
                                    </p>
                                  </div>
                                  {/* Remove Button */}
                                  <button
                                    onClick={() => removeAttachment(index)}
                                    className="flex-shrink-0 text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                    aria-label="Remove attachment"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Chat input pill - same design as student portal */}
                <div className={`flex items-center gap-4 px-5 py-3.5 rounded-3xl ${isDarkMode
                  ? 'bg-white/5 border border-white/10 hover:border-white/20'
                  : 'bg-gray-50 border border-gray-200'
                  } shadow-lg transition-all duration-300 ease-out focus-within:shadow-2xl ${isDarkMode ? 'focus-within:border-white/30 focus-within:bg-white/[0.07]' : 'focus-within:border-blue-500'}`}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.txt,.csv,.json,.py,.js,.ts,.jsx,.tsx,.md,.xml,.html,.css"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading || hasCorpusPdfs === false || attachments.length >= 5}
                    className={`h-8 w-8 ${isDarkMode ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
                    title="Attach file or image"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={toggleDeepThinking}
                    disabled={loading || hasCorpusPdfs === false}
                    className={`h-8 w-8 ${deepThinking ? (isDarkMode ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-700') : isDarkMode ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
                    title="Deep thinking mode"
                  >
                    <Brain className={`h-4 w-4 ${deepThinking ? 'text-purple-500' : ''}`} />
                  </Button>

                  <Textarea
                    ref={textareaRef}
                    placeholder={hasCorpusPdfs === false && selectedClassId && selectedClassId !== 'entire-corpus' ? "No PDFs uploaded for this class..." : "Message LearnBOT..."}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyPress}
                    disabled={loading || hasCorpusPdfs === false}
                    className={`flex-1 min-h-[40px] max-h-[200px] resize-none overflow-y-auto border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base py-2.5 ${isDarkMode ? 'text-white placeholder:text-white/50' : 'text-gray-900 placeholder:text-gray-500'}`}
                    rows={1}
                  />

                  {isVoiceSupported && (
                    <div className="flex items-center gap-2">
                      {isRecording && <VoiceWave isActive={isRecording} className={isDarkMode ? "text-red-400" : "text-red-500"} />}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={isRecording ? stopVoiceInput : startVoiceInput}
                        disabled={loading || hasCorpusPdfs === false}
                        className={`h-8 w-8 ${isRecording ? 'text-red-500' : isDarkMode ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
                        title={isRecording ? "Stop recording" : "Start voice input"}
                      >
                        {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}

                  <Button
                    onClick={sendMessage}
                    disabled={loading || (!input.trim() && attachments.length === 0) || hasCorpusPdfs === false}
                    size="icon"
                    className={`rounded-full w-10 h-10 flex items-center justify-center transition-all duration-300 ease-out ${loading || (!input.trim() && attachments.length === 0)
                      ? isDarkMode
                        ? 'bg-white/5 text-white/30 cursor-not-allowed'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : isDarkMode
                        ? 'bg-white text-black hover:bg-white/95 hover:scale-105 shadow-lg hover:shadow-xl'
                        : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 hover:scale-105 shadow-lg hover:shadow-xl'
                      }`}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <p className={`text-xs text-center mt-3 ${isDarkMode ? 'text-white/50' : 'text-gray-500'}`}>
                  Press Enter to send • LearnBOT can make mistakes
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
