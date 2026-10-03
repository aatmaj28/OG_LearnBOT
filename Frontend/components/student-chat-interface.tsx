// Trigger comment for deployment reset - 2026-02-23
"use client"

import type React from "react"
import { useRouter } from "next/navigation"

import { useState, useEffect, useRef } from "react"
import { flushSync } from "react-dom"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LogoutButton } from "@/components/logout-button"
import { ChatMessage } from "@/components/chat-message"
import { MessageSquare, Send, Plus, Bot, BookOpen, Trash2, Zap, Calendar, PanelLeftClose, PanelLeftOpen, Sun, Moon, Download, Clock, FileText, FolderOpen, ChevronLeft, ChevronRight, X, ExternalLink, Upload, CheckCircle2, Mic, MicOff, Paperclip, File, Image as ImageIcon, Brain, BrainCircuit } from "lucide-react"
import { VoiceWave } from "@/components/voice-wave"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import type { RAGConversation, Class, ModelBackend, Assignment, Resource, ChatAttachment } from "@/lib/types"
import { normalizeModelBackend } from "@/lib/types"
import { getConversationCardTitle } from "@/lib/utils"
import { speechToText } from "@/lib/speech-to-text"
import { voiceLogger } from "@/lib/voice-logger"
import { DeepThinkingAnimation } from "@/components/deep-thinking-animation"

type ChatType = "class_material" | "syllabus"

// A document uploaded for one of the employee's sectors.
type CorpusDocument = { classId: string; className: string; fileName: string }

// Encoding for the document picker. A selection is stored as "<classId>::<fileName>" so one
// Select carries both; an empty fileName means "every document in that sector".
// The sector id is always a real class id, because the backend resolves the Qdrant collection
// from it and would otherwise fail on a non-numeric value.
const DOC_SEPARATOR = "::"
const encodeDocValue = (classId: string, fileName: string) => `${classId}${DOC_SEPARATOR}${fileName}`

// Helper function to extract a meaningful short title (2-4 words) from the first user message
const getShortTitle = (conversation: RAGConversation): string => {
  // Always prioritize the first user message (like ChatGPT)
  if (conversation.messageHistory && conversation.messageHistory.length > 0) {
    const firstUserMessage = conversation.messageHistory.find(msg => msg.role === 'user')
    if (firstUserMessage && firstUserMessage.content) {
      const title = extractTitleFromMessage(firstUserMessage.content)
      if (title && title.length > 0) return title
    }
  }

  // If conversation has a title from backend that's not a summary, use it
  if (conversation.title) {
    const lowerTitle = conversation.title.toLowerCase()
    // Skip titles that are clearly summaries, not user-generated content
    if (!(lowerTitle.startsWith('the student') ||
      lowerTitle.startsWith('student') ||
      lowerTitle.startsWith('here\'s') ||
      lowerTitle.startsWith('here is') ||
      lowerTitle.startsWith('this is') ||
      lowerTitle.startsWith('conversation') ||
      lowerTitle.startsWith('chat '))) {
      return conversation.title
    }
  }

  // For empty chats, show a date-based title instead of "New Chat"
  const date = conversation.createdAt || conversation.updatedAt
  if (date) {
    // Parse the date - handle both Date objects and string timestamps
    // Important: If the Date object was created from a UTC string without 'Z', 
    // it might have been interpreted as local time. We need to ensure proper UTC handling.
    let dateObj: Date
    if (date instanceof Date) {
      // Date object - use it directly (it should already be in the correct timezone)
      // But if it was incorrectly parsed as local time, we need to check
      dateObj = date
    } else {
      // Parse string timestamp - handle UTC and timezone-aware formats
      const dateStr = String(date)
      // If it's already a valid ISO string with timezone, use it directly
      // Otherwise, if it looks like UTC (no timezone), treat it as UTC
      if (dateStr.includes('T') && !dateStr.includes('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
        // ISO format without timezone - assume UTC and add 'Z'
        dateObj = new Date(dateStr + 'Z')
      } else {
        // Has timezone info or other format - let Date constructor handle it
        dateObj = new Date(dateStr)
      }
    }

    if (!isNaN(dateObj.getTime())) {
      // Use toLocaleString - it automatically uses the browser's local timezone (EST for you)
      // This will correctly convert UTC timestamps to EST
      const options: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
        // Note: Not specifying timeZone means it uses the browser's local timezone (EST)
      }
      const formatted = dateObj.toLocaleString('en-US', options)
      return `Chat ${formatted}`
    }
  }

  return 'New Chat'
}

// Extract 2-4 meaningful words from the first user message (ChatGPT-style)
const extractTitleFromMessage = (message: string): string => {
  if (!message || message.trim().length === 0) return ''

  // Remove leading question words and common phrases
  let cleaned = message.trim()

  // Remove question starters and greetings
  const questionStarters = [
    /^how\s+to\s+/i,
    /^how\s+do\s+i\s+/i,
    /^how\s+can\s+i\s+/i,
    /^how\s+do\s+you\s+/i,
    /^what\s+is\s+/i,
    /^what\s+are\s+/i,
    /^what\s+does\s+/i,
    /^what\s+do\s+/i,
    /^can\s+you\s+/i,
    /^could\s+you\s+/i,
    /^would\s+you\s+/i,
    /^please\s+/i,
    /^i\s+want\s+to\s+/i,
    /^i\s+need\s+to\s+/i,
    /^i\s+would\s+like\s+to\s+/i,
    /^hi\s*,?\s*/i,
    /^hello\s*,?\s*/i,
    /^hey\s*,?\s*/i,
  ]

  for (const starter of questionStarters) {
    cleaned = cleaned.replace(starter, '')
  }

  // Remove common phrases that don't add meaning
  cleaned = cleaned.replace(/\b(but|and|or|so|because|since|although|though)\b/gi, ' ')

  // Remove punctuation and clean up
  cleaned = cleaned.replace(/[.,;:!?()\[\]{}'"]/g, ' ').trim()

  // Split into words and filter out very short words and common stop words
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
    'will', 'would', 'should', 'could', 'may', 'might', 'must',
    'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
    'with', 'for', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'of', 'from', 'by',
    'about', 'into', 'through', 'during', 'including', 'against', 'among',
    'if', 'when', 'where', 'why', 'how', 'what', 'which', 'who', 'whom', 'whose',
    'should', 'show', 'seen', 'get', 'got', 'know', 'see', 'one', 'no'
  ])

  // First, try to find key action/object pairs (like "backdate git commits", "calculate future value")
  const actionWords = [
    'backdate', 'backdating', 'commit', 'commits', 'committing',
    'calculate', 'calculation', 'find', 'solve', 'get', 'check', 'list',
    'create', 'update', 'delete', 'show', 'display', 'explain', 'help',
    'invest', 'investment', 'grow', 'grows', 'compounding', 'compounded'
  ]
  const lowerCleaned = cleaned.toLowerCase()

  for (const action of actionWords) {
    if (lowerCleaned.includes(action)) {
      // Find the action word and surrounding context (30 chars before, 50 after)
      const actionIndex = lowerCleaned.indexOf(action)
      const contextStart = Math.max(0, actionIndex - 30)
      const contextEnd = Math.min(cleaned.length, actionIndex + action.length + 50)
      const context = cleaned.substring(contextStart, contextEnd)

      // Extract meaningful words from context
      const contextWords = context.split(/\s+/)
        .map(word => word.toLowerCase().trim().replace(/[.,;:!?()\[\]{}'"]/g, ''))
        .filter(word => word.length >= 2 && !stopWords.has(word))

      if (contextWords.length >= 2) {
        // Find the action word in the context
        const actionWordIndex = contextWords.findIndex(w => w.includes(action.replace('ing', '').replace('ed', '').replace('s', '')))
        if (actionWordIndex >= 0) {
          // Take action word and 1-3 surrounding words
          const start = Math.max(0, actionWordIndex - 1)
          const end = Math.min(contextWords.length, actionWordIndex + 3)
          const titleWords = contextWords.slice(start, end).slice(0, 4)
          if (titleWords.length >= 2) {
            return capitalizeTitle(titleWords.join(' '))
          }
        }
      }
    }
  }

  // Fallback: extract meaningful words
  const words = cleaned.split(/\s+/)
    .map(word => word.toLowerCase().trim().replace(/[.,;:!?()\[\]{}'"]/g, ''))
    .filter(word => {
      // Keep words that are at least 2 characters and not stop words
      return word.length >= 2 && !stopWords.has(word)
    })

  // Take 2-4 meaningful words
  if (words.length === 0) {
    // If all words were filtered, take first 2-3 words anyway (excluding single letters)
    const fallbackWords = cleaned.split(/\s+/)
      .filter(w => w.length > 1)
      .slice(0, 3)
    if (fallbackWords.length > 0) {
      return capitalizeTitle(fallbackWords.join(' '))
    }
    return ''
  }

  const titleWords = words.slice(0, 4) // Take up to 4 words
  return capitalizeTitle(titleWords.join(' '))
}

// Capitalize first letter of each word in title
const capitalizeTitle = (title: string): string => {
  if (!title) return ''

  return title.split(' ')
    .map(word => {
      if (word.length === 0) return word
      // Handle special cases like acronyms (NPV, IRR, EAR, etc.)
      const upperWord = word.toUpperCase()
      if (upperWord === 'NPV' || upperWord === 'IRR' || upperWord === 'EAR' || upperWord === 'APR') {
        return upperWord
      }
      // Capitalize first letter, lowercase rest
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
    .trim()
}

interface StudentChatInterfaceProps {
  showHeader?: boolean
  sidebarLayout?: 'minimal' | 'full'
  isDarkMode?: boolean
}

export function StudentChatInterface({ showHeader = true, sidebarLayout = 'minimal', isDarkMode: isDarkModeProp }: StudentChatInterfaceProps = {}) {
  const router = useRouter()
  const [conversations, setConversations] = useState<RAGConversation[]>([])
  const [currentConversation, setCurrentConversation] = useState<RAGConversation | null>(null)
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [userName, setUserName] = useState("")
  const [selectedClassId, setSelectedClassId] = useState<string>("")
  const [chatType, setChatType] = useState<ChatType>("class_material")
  const [preferredModel, setPreferredModel] = useState<ModelBackend>("local-nemotron")
  const [classes, setClasses] = useState<Class[]>([])
  // Every document across the sectors this employee belongs to.
  const [documents, setDocuments] = useState<CorpusDocument[]>([])
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false)
  // "" means all documents; otherwise the file the chat is scoped to.
  const [selectedDocument, setSelectedDocument] = useState<string>("")
  const [ragStatus, setRagStatus] = useState<{
    isAvailable: boolean
  }>({ isAvailable: false })
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isDarkModeInternal, setIsDarkModeInternal] = useState(false)
  const isDarkMode = isDarkModeProp ?? isDarkModeInternal
  const effectiveShowHeader = showHeader
  const isEmbeddedLayout = !effectiveShowHeader && sidebarLayout === 'full'
  const SIDEBAR_MIN_WIDTH = 300
  const SIDEBAR_MAX_WIDTH = 500
  const [sidebarWidth, setSidebarWidth] = useState(320) // Wide enough so "2 messages" and card text stay visible
  const [isResizing, setIsResizing] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true) // Track if we should auto-scroll
  const isScrollingProgrammaticallyRef = useRef(false) // Track if we're programmatically scrolling
  const prevConversationIdsRef = useRef<string>('') // Track previous conversation IDs for auto-resort
  const sidebarRef = useRef<HTMLDivElement>(null)

  // Resources and Assignments state
  const [resources, setResources] = useState<Resource[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [resourcesClassId, setResourcesClassId] = useState<string>("")
  const [assignmentsClassId, setAssignmentsClassId] = useState<string>("")

  // Assignment submission state
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null)
  const [submissionFile, setSubmissionFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSubmitDialog, setShowSubmitDialog] = useState(false)
  const submissionFileInputRef = useRef<HTMLInputElement>(null)

  // Resource preview state
  const [previewResourceIndex, setPreviewResourceIndex] = useState<number | null>(null)
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null)

  // Download state
  const [isDownloading, setIsDownloading] = useState(false)

  // Corpus/PDF check state
  const [hasCorpusPdfs, setHasCorpusPdfs] = useState<boolean | null>(null) // null = checking, true = has PDFs, false = no PDFs
  const [isCheckingCorpus, setIsCheckingCorpus] = useState(false)

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
  const speechRecognitionRef = useRef<any>(null)
  const baseInputRef = useRef<string>('') // Store base input before recording

  useEffect(() => {
    loadUserData()
    loadClasses()
    loadConversations()
    checkRAGStatus()

    // Check voice input support
    setIsVoiceSupported(speechToText.isBrowserSupported())

    // Load sidebar state from localStorage
    const savedSidebarState = localStorage.getItem("studentSidebarCollapsed")
    if (savedSidebarState !== null) {
      setIsSidebarCollapsed(savedSidebarState === "true")
    }

    // Load sidebar width from localStorage (clamp to min so cards never overflow)
    const savedWidth = localStorage.getItem("studentSidebarWidth")
    if (savedWidth !== null) {
      const width = parseInt(savedWidth, 10)
      if (!isNaN(width)) {
        setSidebarWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width)))
      }
    }

    // Load dark mode state from localStorage
    if (isDarkModeProp === undefined) {
      const savedDarkMode = localStorage.getItem("studentDarkMode")
      if (savedDarkMode !== null) {
        setIsDarkModeInternal(savedDarkMode === "true")
      }
    }

    // Cleanup: stop recording if component unmounts
    return () => {
      if (isRecording) {
        speechToText.stop()
      }
      // Clean up preview URLs
      attachmentPreviews.forEach(({ preview }) => {
        if (preview.startsWith('blob:')) {
          URL.revokeObjectURL(preview)
        }
      })
    }

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
          console.log(`[Student Chat] Preload result: ${result.loaded}/${result.total} stores loaded`)
          if (!result.success && result.error?.includes('not ready')) {
            // RAG not ready yet, retry after a delay
            setTimeout(preloadUserClasses, 3000)
          }
        } catch (error) {
          console.error('[Student Chat] Failed to preload classes:', error)
        }
      }
    }

    preloadUserClasses()

    // Poll status every 5 seconds to detect when RAG becomes ready
    const statusInterval = setInterval(checkRAGStatus, 5000)

    return () => clearInterval(statusInterval)
  }, [])

  // Default to the employee's first sector once sectors are known.
  useEffect(() => {
    if (!selectedClassId && classes.length > 0) {
      setSelectedClassId(classes[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes]) // Only depend on classes, not selectedClassId to avoid loops

  // Build the document list from every sector the employee belongs to.
  useEffect(() => {
    let cancelled = false

    const loadDocuments = async () => {
      if (classes.length === 0) {
        setDocuments([])
        return
      }

      setIsLoadingDocuments(true)
      try {
        const { corpusApi } = await import("@/lib/flask-api-client")
        const perSector = await Promise.all(
          classes.map(async (classItem) => {
            try {
              const data = await corpusApi.getFiles(classItem.id, chatType) as { files?: string[] }
              return (data.files ?? []).map((fileName) => ({
                classId: classItem.id,
                className: classItem.name,
                fileName,
              }))
            } catch {
              // One sector failing shouldn't blank out the whole picker.
              return [] as CorpusDocument[]
            }
          })
        )
        if (!cancelled) setDocuments(perSector.flat())
      } finally {
        if (!cancelled) setIsLoadingDocuments(false)
      }
    }

    loadDocuments()
    return () => { cancelled = true }
  }, [classes, chatType])

  // A document picked under one chat type may not exist under the other.
  useEffect(() => {
    if (!selectedDocument) return
    const stillExists = documents.some(
      (doc) => doc.classId === selectedClassId && doc.fileName === selectedDocument
    )
    if (!isLoadingDocuments && !stillExists) {
      setSelectedDocument("")
    }
  }, [documents, isLoadingDocuments, selectedDocument, selectedClassId])

  useEffect(() => {
    if (selectedClassId) {
      loadConversations()
      checkCorpusPdfs()
    } else {
      setHasCorpusPdfs(null)
    }
  }, [selectedClassId, chatType])

  // Check if selected class has PDFs uploaded (use Flask API so chat box enables in production)
  const checkCorpusPdfs = async () => {
    if (!selectedClassId) {
      setHasCorpusPdfs(true)
      return
    }

    setIsCheckingCorpus(true)
    try {
      const userId = localStorage.getItem("userId") ?? undefined
      const { corpusApi } = await import("@/lib/flask-api-client")
      const data = await corpusApi.getClassCorpusStats(selectedClassId, chatType, userId)

      const canChat = data.canChat !== undefined
        ? data.canChat
        : (data.hasIndexedFiles !== undefined
          ? data.hasIndexedFiles
          : ((data.pdfCount || 0) > 0 || (data.chunkCount || 0) > 0))

      console.log(`[Student Chat] Corpus check for class ${selectedClassId} (${chatType}):`, {
        pdfCount: data.pdfCount,
        chunkCount: data.chunkCount,
        isEnrolled: data.isEnrolled,
        hasIndexedFiles: data.hasIndexedFiles,
        canChat: data.canChat,
        calculatedCanChat: canChat,
        className: classes.find(c => c.id === selectedClassId)?.name || 'Unknown'
      })

      if (userId && data.isEnrolled === false) {
        console.warn(`[Student Chat] Student ${userId} is not enrolled in class ${selectedClassId}`)
        setHasCorpusPdfs(false)
        return
      }

      setHasCorpusPdfs(canChat)
    } catch (error) {
      console.error('[Student Chat] Failed to check corpus PDFs:', error)
      setHasCorpusPdfs(false)
    } finally {
      setIsCheckingCorpus(false)
    }
  }

  // Auto-resort conversations when they change (e.g., after updates)
  useEffect(() => {
    if (conversations.length > 0) {
      const getDateValue = (date: Date | string | undefined): number => {
        if (!date) return 0
        if (date instanceof Date) {
          const time = date.getTime()
          return isNaN(time) ? 0 : time
        }
        const parsed = new Date(date)
        const time = parsed.getTime()
        return isNaN(time) ? 0 : time
      }

      const sorted = [...conversations].sort((a, b) => {
        const dateA = getDateValue(a.updatedAt) || getDateValue(a.createdAt) || 0
        const dateB = getDateValue(b.updatedAt) || getDateValue(b.createdAt) || 0

        // If dates are equal, sort by ID as tiebreaker (newer IDs first)
        if (dateB === dateA) {
          return parseInt(b.id) - parseInt(a.id)
        }

        return dateB - dateA
      })

      // Only update if order actually changed (avoid infinite loops)
      const currentOrder = conversations.map(c => c.id).join(',')
      const sortedOrder = sorted.map(c => c.id).join(',')
      const currentIds = conversations.map(c => c.id).sort().join(',')

      // Only resort if IDs changed or order is different
      if (currentIds !== prevConversationIdsRef.current || currentOrder !== sortedOrder) {
        prevConversationIdsRef.current = currentIds
        if (currentOrder !== sortedOrder) {
          setConversations(sorted)
        }
      }
    }
  }, [conversations])


  // Reload conversations and clear current conversation when chat type changes
  useEffect(() => {
    if (selectedClassId) {
      setCurrentConversation(null) // Clear current conversation when switching types
      loadConversations()
    }
  }, [chatType])

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
    // Use codePointAt for proper emoji handling (emojis are multi-byte surrogate pairs)
    let result = ''
    for (let i = 0; i < content.length; i++) {
      const codePoint = content.codePointAt(i) || 0
      // Skip surrogate pair second halves (already consumed with first half)
      if (codePoint >= 0xD800 && codePoint <= 0xDFFF) {
        continue
      }

      // Allow: ASCII (0-127), safe Unicode ranges, and emojis
      if (codePoint <= 127 ||
        (codePoint >= 0x2000 && codePoint <= 0x206F) ||  // General Punctuation
        (codePoint >= 0x20A0 && codePoint <= 0x20CF) ||  // Currency symbols
        (codePoint >= 0x2100 && codePoint <= 0x214F) ||  // Letterlike Symbols
        (codePoint >= 0x2190 && codePoint <= 0x21FF) ||  // Arrows
        (codePoint >= 0x2200 && codePoint <= 0x22FF) ||  // Mathematical Operators
        (codePoint >= 0x2300 && codePoint <= 0x23FF) ||  // Miscellaneous Technical
        (codePoint >= 0x2400 && codePoint <= 0x243F) ||  // Control Pictures
        (codePoint >= 0x25A0 && codePoint <= 0x25FF) ||  // Geometric Shapes
        (codePoint >= 0x2600 && codePoint <= 0x26FF) ||  // Miscellaneous Symbols (includes some emojis)
        (codePoint >= 0x2700 && codePoint <= 0x27BF) ||  // Dingbats
        (codePoint >= 0x1F300 && codePoint <= 0x1F9FF) || // Emoticons and Symbols
        (codePoint >= 0x1F600 && codePoint <= 0x1F64F) || // Emoticons
        (codePoint >= 0x1F900 && codePoint <= 0x1F9FF) || // Supplemental Symbols and Pictographs
        (codePoint >= 0x1FA00 && codePoint <= 0x1FAFF) || // Symbols and Pictographs Extended-A
        (codePoint >= 0xFE00 && codePoint <= 0xFE0F) ||   // Variation Selectors
        (codePoint >= 0xFE20 && codePoint <= 0xFE2F)) {   // Combining Half Marks
        result += String.fromCodePoint(codePoint)
        // Skip the next char index if this was a supplementary-plane code point (surrogate pair)
        if (codePoint > 0xFFFF) {
          i++
        }
      }
      // Skip corrupted/unknown sequences
    }

    // Clean up multiple spaces (but preserve newlines)
    result = result.replace(/[ \t]+/g, ' ')  // Collapse spaces/tabs only
    result = result.replace(/\n{3,}/g, '\n\n')  // Limit consecutive newlines to 2

    return result
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

  const loadUserData = async () => {
    const sessionId = localStorage.getItem("sessionId")
    if (!sessionId) return

    try {
      const { authApi } = await import("@/lib/flask-api-client")
      const data = await authApi.getSession(sessionId)
      setUserName(data.user.name)
    } catch (error) {
      console.error("[v0] Failed to load user data:", error)
    }
  }

  const loadClasses = async () => {
    const userId = localStorage.getItem("userId")
    if (!userId) return

    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      const data = (await classesApi.getClasses(undefined, userId)) as { classes?: Class[] }
      setClasses(data.classes || [])
      // Auto-select first class if available
      if (data.classes && data.classes.length > 0) {
        setSelectedClassId(data.classes[0].id)
      }
    } catch (error) {
      console.error("[Student Chat] Failed to load classes:", error)
      setClasses([])
    }
  }

  // Helper function to normalize timestamps from API response (JSON serializes Date to string)
  const normalizeConversation = (conversation: any): RAGConversation => {
    if (!conversation) return conversation

    // Helper to safely parse a timestamp - only converts if valid, otherwise preserves original
    // Match faculty: parse as-is so server local time (e.g. EST from datetime.now().isoformat()) displays correctly
    const safeParseTimestamp = (ts: any): Date => {
      if (ts instanceof Date) {
        return isNaN(ts.getTime()) ? ts : ts
      }
      if (!ts) {
        console.warn('[Normalize] Missing timestamp, this should not happen')
        return new Date(0)
      }
      const parsed = new Date(ts)
      if (!isNaN(parsed.getTime())) {
        return parsed
      }
      console.warn('[Normalize] Failed to parse timestamp:', ts)
      return new Date(0)
    }

    const messageHistory = Array.isArray(conversation.messageHistory)
      ? conversation.messageHistory.map((msg: any) => ({
          ...msg,
          timestamp: safeParseTimestamp(msg.timestamp)
        }))
      : []

    const dedupeByName = <T extends { name?: string }>(arr: T[], max: number) => {
      const seen = new Set<string>()
      return arr.filter((x) => {
        const n = x.name || ''
        if (seen.has(n) || seen.size >= max) return false
        seen.add(n)
        return true
      })
    }
    // If API returned null cachedContext, derive so "Documents in this chat" and "Images in this chat" persist
    let cachedContext = conversation.cachedContext ?? undefined
    const hasDocs = (cachedContext?.persistent_attachments?.length ?? 0) > 0
    const hasImages = (cachedContext?.persistent_images?.length ?? 0) > 0
    if ((!hasDocs || !hasImages) && messageHistory.length > 0) {
      const fromHistoryDocs: Array<{ name?: string; summary?: string }> = []
      const fromHistoryImages: Array<{ name?: string }> = []
      const seenDoc = new Set<string>()
      const seenImg = new Set<string>()
      for (const msg of messageHistory) {
        if (msg?.role === 'user' && Array.isArray(msg.attachments)) {
          for (const att of msg.attachments) {
            const name = att?.name || 'Document'
            const isImage = (att?.type ?? '').toString().toLowerCase().startsWith('image')
            if (isImage) {
              if (!seenImg.has(name) && fromHistoryImages.length < 3) {
                seenImg.add(name)
                fromHistoryImages.push({ name })
              }
            } else {
              if (!seenDoc.has(name) && fromHistoryDocs.length < 3) {
                seenDoc.add(name)
                fromHistoryDocs.push({ name, summary: '' })
              }
            }
          }
        }
      }
      if (fromHistoryDocs.length > 0 || fromHistoryImages.length > 0) {
        cachedContext = {
          ...(cachedContext || {}),
          persistent_attachments: dedupeByName(hasDocs ? (cachedContext?.persistent_attachments ?? []) : fromHistoryDocs, 3),
          persistent_images: dedupeByName(hasImages ? (cachedContext?.persistent_images ?? []) : fromHistoryImages, 3)
        }
      }
    }
    // Always dedupe API-returned or derived lists so we never show duplicate chips
    if (cachedContext) {
      if (cachedContext.persistent_attachments?.length) {
        cachedContext = { ...cachedContext, persistent_attachments: dedupeByName(cachedContext.persistent_attachments as { name?: string }[], 3) }
      }
      if (cachedContext.persistent_images?.length) {
        cachedContext = { ...cachedContext, persistent_images: dedupeByName(cachedContext.persistent_images as { name?: string }[], 3) }
      }
    }

    return {
      ...conversation,
      createdAt: safeParseTimestamp(conversation.createdAt),
      updatedAt: safeParseTimestamp(conversation.updatedAt),
      analyticsLastUpdated: conversation.analyticsLastUpdated
        ? safeParseTimestamp(conversation.analyticsLastUpdated)
        : undefined,
      cachedContext,
      messageHistory
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

      // Helper function to get safe timestamp for sorting
      const getSortTime = (date: Date | string | undefined): number => {
        if (!date) return 0

        let dateObj: Date
        if (date instanceof Date) {
          dateObj = date
        } else {
          // Handle string parsing similar to getShortTitle
          const dateStr = String(date)
          // Assume UTC if it looks like an ISO string without timezone info
          const utcDateStr = dateStr.includes('T') && !dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-05:') && !dateStr.includes('-04:')
            ? dateStr + 'Z'
            : dateStr
          dateObj = new Date(utcDateStr)
        }

        const time = dateObj.getTime()
        return isNaN(time) ? 0 : time
      }

      // Sort in reverse chronological order (newest first)
      // Prioritize updatedAt, fallback to createdAt
      const sortedConversations = [...normalizedConversations].sort((a, b) => {
        const timeA = getSortTime(a.updatedAt) || getSortTime(a.createdAt) || 0
        const timeB = getSortTime(b.updatedAt) || getSortTime(b.createdAt) || 0

        // If dates are equal, sort by ID as tiebreaker (newer IDs first/larger)
        if (timeA === timeB) {
          // Try to sort by ID if it looks like a number or sortable string
          if (a.id && b.id) {
            // If IDs are numeric strings
            const idA = parseInt(a.id)
            const idB = parseInt(b.id)
            if (!isNaN(idA) && !isNaN(idB)) {
              return idB - idA
            }
            // Lexicographical sort for non-numeric IDs (usually newer IDs > older IDs)
            return b.id.localeCompare(a.id)
          }
          return 0
        }

        return timeB - timeA // Descending order (larger/recent timestamp first)
      })

      setConversations(sortedConversations)
    } catch (error) {
      console.error("[v0] Failed to load conversations:", error)
      setConversations([])
    }
  }

  const loadConversation = async (conversationId: string) => {
    try {
      const { chatApi } = await import("@/lib/flask-api-client")
      const data = await chatApi.getConversation(conversationId)
      // Normalize timestamps from strings to Date objects
      const normalizedConversation = normalizeConversation(data.conversation)
      setCurrentConversation(normalizedConversation)
      // Reset auto-scroll when loading a conversation
      shouldAutoScrollRef.current = true
      // Don't close the history pane when loading a conversation
    } catch (error) {
      console.error("[v0] Failed to load conversation:", error)
    }
  }

  const createNewConversation = async () => {
    const userId = localStorage.getItem("userId")
    if (!userId) return

    // Fall back to all documents if nothing is selected yet
    let classIdToUse = selectedClassId
    if (!classIdToUse && classes.length > 0) {
      classIdToUse = classes[0].id
      setSelectedClassId(classIdToUse)
    }

    if (!classIdToUse) {
      console.error("[v0] No sector available for this employee")
      alert("You are not assigned to a sector yet. Ask your manager to add you to one.")
      return
    }

    try {
      const { chatApi } = await import("@/lib/flask-api-client")
      const data = await chatApi.createConversation({ userId, classId: classIdToUse, chatType, title: undefined })
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

  // File Upload Handlers
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    // Filter valid file types (images and common document types)
    let validFiles = files.filter(file => {
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
      toast.error('Some files were skipped. Only images, PDFs, and documents are supported.')
    }

    if (validFiles.length === 0) return

    // Enforce 3 docs + 3 images per chat session (separate limits)
    const persistentDocs = currentConversation?.cachedContext?.persistent_attachments?.length || 0
    const persistentImages = currentConversation?.cachedContext?.persistent_images?.length || 0
    const currentDocs = attachments.filter(f => !f.type.startsWith('image/')).length
    const currentImages = attachments.filter(f => f.type.startsWith('image/')).length
    const allowedDocs = Math.max(0, 3 - (persistentDocs + currentDocs))
    const allowedImages = Math.max(0, 3 - (persistentImages + currentImages))

    const existingNames = new Set(attachments.map(f => f.name))
    let docsAdded = 0
    let imagesAdded = 0
    const capped: File[] = []
    for (const file of validFiles) {
      if (existingNames.has(file.name)) continue
      existingNames.add(file.name)
      const isImage = file.type.startsWith('image/')
      if (isImage) {
        if (imagesAdded >= allowedImages) {
          toast.error(`MAX image upload limit reached (3). You cannot attach more images to this chat.`)
          break
        }
        capped.push(file)
        imagesAdded++
      } else {
        if (docsAdded >= allowedDocs) {
          toast.error(`MAX document upload limit reached (3). You cannot attach more documents to this chat.`)
          break
        }
        capped.push(file)
        docsAdded++
      }
    }
    if (capped.length === 0) {
      if (allowedDocs === 0 && allowedImages === 0) {
        toast.error('MAX upload limit reached (3 documents + 3 images). You cannot attach more to this chat.')
      }
      return
    }
    const validFilesCapped = capped

    // Limit the current message attachments array
    const newFiles = [...attachments, ...validFilesCapped]
    setAttachments(newFiles)

    // Generate previews for images
    const newPreviews: Array<{ file: File; preview: string }> = []
    validFilesCapped.forEach(file => {
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
      toast.error('Voice input is not supported in your browser')
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
          toast.error(error)
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
      toast.error(error.message || 'Failed to start voice input')
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
    if (!deepThinking) {
      toast.info('Deep Thinking Mode enabled - AI will provide more detailed analysis')
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userId = localStorage.getItem("userId")
    if (!userId) return

    // Create conversation if none exists
    if (!currentConversation) {
      await createNewConversation()
      return
    }

    const userMessage = input.trim()
    const messageAttachments = attachments // Store attachments before clearing
    setInput("")
    setAttachments([])
    // Clean up preview URLs except for images we're sending (keep those so the sent message shows the preview)
    attachmentPreviews.forEach(({ file, preview }) => {
      if (preview.startsWith('blob:') && !messageAttachments.some(f => f === file)) {
        URL.revokeObjectURL(preview)
      }
    })
    setAttachmentPreviews([])
    setLoading(true)
    // Reset auto-scroll when sending a new message
    shouldAutoScrollRef.current = true

    // Track time to first token (TTFT)
    const sendTimestamp = Date.now()
    let firstTokenTimestamp: number | null = null

    // Add user message to conversation immediately for instant display
    const userMessageTimestamp = new Date()
    const userMessageObj = {
      role: "user" as const,
      content: userMessage,
      timestamp: userMessageTimestamp,
      metadata: {},
      attachments: messageAttachments.length > 0 ? messageAttachments.map(file => ({
        type: (file.type.startsWith('image/') ? 'image' : 'file') as 'image' | 'file',
        url: file.type.startsWith('image/') ? (attachmentPreviews.find(p => p.file === file)?.preview ?? '') : '',
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

    // Optimistically update persistent_attachments (docs) and persistent_images; dedupe by name so same file never shows twice
    if (messageAttachments.length > 0) {
      setCurrentConversation(prev => {
        if (!prev) return prev
        const existingDocs = prev.cachedContext?.persistent_attachments || []
        const existingImages = prev.cachedContext?.persistent_images || []
        const docFiles = messageAttachments.filter(f => !f.type.startsWith('image/'))
        const imageFiles = messageAttachments.filter(f => f.type.startsWith('image/'))
        const seenDoc = new Set((existingDocs as { name?: string }[]).map(d => d.name))
        const mergedDocs = [...existingDocs]
        for (const f of docFiles) {
          if (mergedDocs.length >= 3) break
          if (!seenDoc.has(f.name)) {
            seenDoc.add(f.name)
            mergedDocs.push({ name: f.name, summary: '(pending)' })
          }
        }
        const seenImg = new Set((existingImages as { name?: string }[]).map(d => d.name))
        const mergedImages = [...existingImages]
        for (const f of imageFiles) {
          if (mergedImages.length >= 3) break
          if (!seenImg.has(f.name)) {
            seenImg.add(f.name)
            mergedImages.push({ name: f.name })
          }
        }
        return {
          ...prev,
          cachedContext: { ...prev.cachedContext, persistent_attachments: mergedDocs, persistent_images: mergedImages }
        }
      })
    }

    // Force smooth scroll to bottom immediately after adding user message
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
      }, 200) // Small delay to ensure animation component is rendered
    }

    // Define streaming mode - always use streaming for better UX
    const stream = true

    try {
      console.log("[v0] Starting fetch request to /api/chat/ai-response (STREAMING)")
      console.log("[v0] Request body:", { message: userMessage, userId, sessionId: currentConversation.id })

      // Capture timestamp BEFORE sending request - this will be used for the assistant message
      const assistantMessageTimestamp = new Date()

      // Deep Thinking is no longer an artificial delay: the flag is sent to the backend, which
      // turns on the model's real reasoning pass for this message.

      // Send message with streaming enabled
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 120000) // 2 minute timeout

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
        if (selectedDocument) formData.append('sourceFile', selectedDocument)
        formData.append('chatType', chatType)
        formData.append('preferredModel', preferredModel)
        formData.append('stream', 'true')
        formData.append('deepThinking', deepThinking.toString())
        formData.append('assistantMessageTimestamp', assistantMessageTimestamp.toISOString())

        messageAttachments.forEach((file, index) => {
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
          sourceFile: selectedDocument || undefined,
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
      if (stream) {
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
          sourceFile: selectedDocument || undefined,
          chatType,
          preferredModel,
          stream: false,
          deepThinking,
        })

        // Handle non-streaming response
        if (result.response) {
          // Add user message
          const userMessageObj = {
            role: "user" as const,
            content: userMessage,
            timestamp: userMessageTimestamp,
          }

          // Add assistant message
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
        const fetchHeaders: HeadersInit = {
          "Content-Type": "application/json",
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
      console.log("[v0] Response headers:", Object.fromEntries(response.headers.entries()))
      console.log("[v0] Content-Type:", response.headers.get('content-type'))

      if (response.ok) {
        const contentType = response.headers.get('content-type')
        console.log("[v0] Checking content type for streaming:", contentType)

        // ── Queue Mode: API returned JSON with taskId ──────────────
        // When RabbitMQ workers are active, the POST returns instantly
        // with { taskId, status: "queued" }. We then open an SSE 
        // connection to /api/chat/stream/<taskId> to get the streamed response.
        if (contentType?.includes('application/json')) {
          const jsonData = await response.json()

          if (jsonData.taskId) {
            console.log("[v0] 🚀 Queue mode: task", jsonData.taskId, "queued. Opening SSE stream...")

            // Open SSE connection to the stream endpoint
            const streamController = new AbortController()
            const streamTimeoutId = setTimeout(() => streamController.abort(), 150000) // 2.5 min

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
          console.log("[v0] ✅ Streaming response detected (text/event-stream)")

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

          if (reader) {
            let accumulatedResponse = ''
            let chunkCount = 0
            // Buffer incomplete SSE lines so we don't parse partial JSON when a read() splits mid-event
            let sseBuffer = ''

            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) {
                  console.log(`[v0] Stream reader done. Total chunks received: ${chunkCount}`)
                  break
                }

                const chunk = decoder.decode(value, { stream: true })
                sseBuffer += chunk
                const lines = sseBuffer.split('\n')
                sseBuffer = lines.pop() ?? ''

                for (const line of lines) {
                  const trimmed = line.trim()
                  if (trimmed === '') continue
                  if (trimmed.startsWith('data: ')) {
                    try {
                      const data = JSON.parse(trimmed.slice(6))
                      console.log(`[v0] 📨 Parsed SSE data:`, data)

                      if (data.content) {
                        chunkCount++
                        console.log(`[v0] ✅ Content chunk #${chunkCount}:`, data.content.substring(0, 50))
                        // Sanitize content immediately to remove corrupted emojis
                        const sanitizedChunk = sanitizeContentChunk(data.content)

                        // Track time to first token (only once)
                        if (firstTokenTimestamp === null && sanitizedChunk.trim()) {
                          firstTokenTimestamp = Date.now()
                          const ttft = firstTokenTimestamp - sendTimestamp
                          console.log(`[v0] ⚡ Time to First Token: ${ttft}ms`)

                          // Hide Deep Thinking animation when stream actual text starts
                          setIsDeepThinking(false)
                        }

                        accumulatedResponse += sanitizedChunk

                        // Update the last message (assistant) with new content
                        // Use flushSync to force immediate render for streaming effect
                        flushSync(() => {
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
                        })

                        // Small delay to allow React to render before processing next chunk
                        await new Promise(resolve => setTimeout(resolve, 0))

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
                        console.log("[v0] Streaming completed, modelUsed from done event:", data.modelUsed, "preferredModel:", preferredModel)

                        // If the response finished very fast (e.g. error or cached), still enforce 4s minimum for Deep Thinking
                        if (deepThinking && isDeepThinking) {
                          const timeElapsed = Date.now() - sendTimestamp
                          if (timeElapsed < 4000) {
                            await new Promise(resolve => setTimeout(resolve, 4000 - timeElapsed))
                          }
                          setIsDeepThinking(false)
                        }

                        // Use the streamed response directly (formatting is applied in ChatMessage rendering)
                        // No content swap — prevents the visible blink/glitch at end of streaming.
                        // LLM generates its own emojis naturally — no frontend emoji insertion.
                        const finalContent = accumulatedResponse

                        console.log("[v0] Final content length:", finalContent.length)
                        console.log("[v0] Final content preview:", finalContent.substring(0, 200))

                        // Capture modelUsed from the done event and update metadata
                        // Use modelUsed from done event if available, otherwise fallback to preferredModel
                        const actualModelUsed = data.modelUsed || preferredModel
                        console.log("[v0] Using modelUsed:", actualModelUsed)

                        // Calculate ALL timing metadata here so we can do a SINGLE state update
                        // (eliminates the double re-render that caused visual blink at stream end)
                        const lastTokenTimestamp = Date.now()
                        const doneResponseTime = lastTokenTimestamp - sendTimestamp
                        const doneTtft = firstTokenTimestamp ? firstTokenTimestamp - sendTimestamp : null
                        console.log(`[v0] 📊 Total Response Time: ${doneResponseTime}ms, TTFT: ${doneTtft}ms`)

                        // Single setCurrentConversation call with ALL final metadata
                        // This eliminates the double re-render that caused the blink
                        setCurrentConversation(prev => {
                          if (!prev) return prev
                          const messages = [...(prev.messageHistory || [])]
                          if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
                            messages[messages.length - 1] = {
                              ...messages[messages.length - 1],
                              content: finalContent, // Streamed response — formatting applied at render time
                              metadata: {
                                ...messages[messages.length - 1].metadata,
                                modelUsed: actualModelUsed,
                                timeToFirstToken: doneTtft,
                                totalResponseTime: doneResponseTime
                              }
                            }
                          }
                          return { ...prev, messageHistory: messages }
                        })

                        // Update accumulatedResponse for consistency
                        accumulatedResponse = finalContent

                        break
                      }
                    } catch (e) {
                      console.error("[v0] Failed to parse SSE data:", e)
                    }
                  }
                }
              }

              // All timing metadata (TTFT, totalResponseTime, modelUsed) is now set in the done
              // handler above in a SINGLE setCurrentConversation call to prevent double re-render blink.

              // Silently refresh conversations list in background (don't reload current conversation to avoid blink)
              loadConversations().catch(err => console.error("[v0] Failed to refresh conversations list:", err))

              // Silently sync the updated cachedContext from DB so persistent attachments remain accurate
              import("@/lib/flask-api-client").then(({ chatApi }) => {
                chatApi.getConversation(currentConversation.id).then(data => {
                  if (data?.conversation?.cachedContext) {
                    setCurrentConversation(prev => prev ? { ...prev, cachedContext: data.conversation.cachedContext } : prev)
                  }
                }).catch(err => console.error("[v0] Failed to sync cached context:", err))
              })
            } catch (streamError: unknown) {
              console.error("[v0] Stream read error (often ERR_HTTP2_PROTOCOL_ERROR):", streamError)
              toast.error("Connection interrupted during response. Please try again.")
              await loadConversation(currentConversation.id).catch(() => { })
            }
          }
        } else {
          // Non-streaming response (fallback)
          console.log("[v0] ⚠️ Non-streaming response detected (Content-Type:", contentType, ")")
          console.log("[v0] ⚠️ Expected 'text/event-stream' but got:", contentType)
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const toggleSidebar = () => {
    const newState = !isSidebarCollapsed
    setIsSidebarCollapsed(newState)
    localStorage.setItem("studentSidebarCollapsed", String(newState))
  }

  const toggleDarkMode = () => {
    if (isDarkModeProp !== undefined) return
    const newState = !isDarkMode
    setIsDarkModeInternal(newState)
    localStorage.setItem("studentDarkMode", String(newState))
  }

  // Handle sidebar resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return

      const newWidth = e.clientX
      const clamped = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, newWidth))
      setSidebarWidth(clamped)
      localStorage.setItem("studentSidebarWidth", String(clamped))
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing])

  const loadStudentResources = async () => {
    if (!resourcesClassId) return

    const userId = localStorage.getItem("userId")
    if (!userId) return

    try {
      const response = await fetch(`/api/classes/resources?classId=${resourcesClassId}&userId=${userId}`)
      if (response.ok) {
        const data = await response.json()
        setResources(data.resources || [])
      }
    } catch (error) {
      console.error("[v0] Failed to load resources:", error)
    }
  }

  const loadStudentAssignments = async () => {
    if (!assignmentsClassId) return

    const userId = localStorage.getItem("userId")
    if (!userId) return

    try {
      const response = await fetch(`/api/classes/assignments?classId=${assignmentsClassId}&userId=${userId}`)
      if (response.ok) {
        const data = await response.json()
        setAssignments(data.assignments || [])
      }
    } catch (error) {
      console.error("[v0] Failed to load assignments:", error)
    }
  }

  const handleSubmitAssignment = async () => {
    if (!selectedAssignment || !submissionFile) {
      toast.error("Please select a PDF file to submit")
      return
    }

    setIsSubmitting(true)
    try {
      // Simulate submission - for now just show confirmation
      await new Promise(resolve => setTimeout(resolve, 1000))

      toast.success("Assignment submitted successfully!", {
        icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
        duration: 3000,
      })

      setShowSubmitDialog(false)
      setSelectedAssignment(null)
      setSubmissionFile(null)
      if (submissionFileInputRef.current) {
        submissionFileInputRef.current.value = ""
      }
    } catch (error) {
      console.error("[v0] Failed to submit assignment:", error)
      toast.error("Failed to submit assignment")
    } finally {
      setIsSubmitting(false)
    }
  }

  const openPreview = async (index: number) => {
    if (!resourcesClassId || !resources[index]) return

    const userId = localStorage.getItem("userId")
    if (!userId) return

    setPreviewResourceIndex(index)
    setShowPreviewDialog(true)

    // Fetch the file as a blob and create an object URL for preview
    try {
      const response = await fetch(`/api/classes/resources/download?classId=${resourcesClassId}&fileName=${encodeURIComponent(resources[index].fileName)}&userId=${userId}`)
      if (response.ok) {
        const blob = await response.blob()
        const blobUrl = URL.createObjectURL(blob)
        setPreviewBlobUrl(blobUrl)
      }
    } catch (error) {
      console.error("[v0] Failed to load resource for preview:", error)
    }
  }

  const navigateToResource = async (index: number) => {
    if (index >= 0 && index < resources.length && resourcesClassId) {
      setPreviewResourceIndex(index)

      // Clean up previous blob URL
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl)
        setPreviewBlobUrl(null)
      }

      // Fetch the new file as a blob and create an object URL for preview
      try {
        const response = await fetch(`/api/classes/resources/download?classId=${resourcesClassId}&fileName=${encodeURIComponent(resources[index].fileName)}`)
        if (response.ok) {
          const blob = await response.blob()
          const blobUrl = URL.createObjectURL(blob)
          setPreviewBlobUrl(blobUrl)
        }
      } catch (error) {
        console.error("[v0] Failed to load resource for preview:", error)
      }
    }
  }

  const downloadResource = async (fileName: string) => {
    if (!resourcesClassId || isDownloading) return

    const userId = localStorage.getItem("userId")
    if (!userId) return

    setIsDownloading(true)
    try {
      const response = await fetch(`/api/classes/resources/download?classId=${resourcesClassId}&fileName=${encodeURIComponent(fileName)}&userId=${userId}`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
        // Keep loading state for a brief moment to show feedback
        await new Promise(resolve => setTimeout(resolve, 300))
      }
    } catch (error) {
      console.error("[v0] Failed to download resource:", error)
    } finally {
      setIsDownloading(false)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i]
  }

  const exportChat = () => {
    if (!currentConversation) {
      alert("No conversation to export")
      return
    }

    // Get class name
    const className = classes.find(c => c.id === selectedClassId)?.name || 'Unknown sector'

    // Format chat type
    const chatTypeFormatted = chatType === 'class_material' ? 'Training Material' : 'Policies & Schedule'

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
    exportContent += `Employee: ${userName}\n`
    exportContent += `Sector: ${className}\n`
    exportContent += `Document: ${selectedDocument || 'All documents in sector'}\n`
    exportContent += `Chat Type: ${chatTypeFormatted}\n`
    exportContent += `Date Started: ${formattedDate}\n`
    exportContent += `Time Started: ${formattedTime}\n`
    exportContent += `Conversation Title: ${currentConversation.title}\n`
    exportContent += `\n${'='.repeat(80)}\n\n`

    // Add messages
    if (currentConversation.messageHistory && currentConversation.messageHistory.length > 0) {
      currentConversation.messageHistory.forEach((message, index) => {
        const role = message.role === 'user' ? '[USER]' : '[AI AGENT]'
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

  const rootHeightClass = isEmbeddedLayout ? 'h-full' : 'h-screen'

  return (
    <div className={`${rootHeightClass} flex flex-col overflow-hidden ${isDarkMode ? 'dark bg-gradient-to-br from-gray-900 to-blue-950' : 'bg-gradient-to-br from-gray-50 to-blue-50/20'}`}>
      {effectiveShowHeader && (
        <header className={`border-b shadow-sm ${isDarkMode ? 'bg-gray-800/90 border-gray-700' : 'bg-white/80'} backdrop-blur-sm`}>
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-white/10' : 'bg-gradient-to-br from-blue-600 to-indigo-700'}`}>
                <Bot className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className={`font-semibold text-lg ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>LearnBOT</h1>
                <p className={`text-sm ${isDarkMode ? 'text-white/60' : 'text-gray-600'}`}>Welcome, {userName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={toggleDarkMode}
                className={`rounded-lg ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-100'}`}
                title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
              >
                {isDarkMode ? (
                  <Sun className={`h-5 w-5 ${isDarkMode ? 'text-white/60' : 'text-yellow-400'}`} />
                ) : (
                  <Moon className="h-5 w-5 text-gray-700" />
                )}
              </Button>
              <LogoutButton />
            </div>
          </div>
        </header>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Collapsed Sidebar - Very narrow strip with expand button */}
        {isSidebarCollapsed && (
          <div className={`w-12 border-r shadow-sm transition-all duration-300 ease-in-out ${isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white'} flex flex-col items-center py-4`}>
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleSidebar}
              className={`w-10 h-10 ${isDarkMode ? 'hover:bg-white/5 text-white/60' : 'hover:bg-gray-100 text-gray-700'}`}
              title="Show sidebar"
            >
              <PanelLeftOpen className={`h-5 w-5 ${isDarkMode ? 'text-white/60' : 'text-gray-700'}`} />
            </Button>
          </div>
        )}

        {/* Sidebar - fixed boundary: flex-shrink-0, min width so cards stay inside */}
        {!isSidebarCollapsed && (
          <div
            ref={sidebarRef}
            className={`flex-shrink-0 border-r transition-all duration-200 ease-in-out overflow-hidden ${isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'} flex flex-col relative w-full`}
            style={{ width: `${sidebarWidth}px`, minWidth: `${SIDEBAR_MIN_WIDTH}px`, maxWidth: `${SIDEBAR_MAX_WIDTH}px` }}
          >
            {/* Resize Handle */}
            <div
              onMouseDown={(e) => {
                e.preventDefault()
                setIsResizing(true)
              }}
              className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 transition-colors z-30 ${isResizing ? 'bg-blue-500' : ''}`}
              style={{ cursor: 'col-resize' }}
              title="Drag to resize"
            />

            {/* Sidebar Toggle Button - Positioned on the right edge */}
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleSidebar}
              className={`absolute top-3 right-3 z-20 h-8 w-8 ${isDarkMode ? 'hover:bg-white/5 text-white/60' : 'hover:bg-gray-100 text-gray-700'}`}
              title="Hide sidebar"
            >
              <PanelLeftClose className={`h-4 w-4 ${isDarkMode ? 'text-white/60' : 'text-gray-700'}`} />
            </Button>

            {/* Fixed-width content area so cards never overflow */}
            <div className="flex flex-1 flex-col min-w-0 w-full overflow-x-hidden">
              {sidebarLayout === 'full' && (
                <div className={`min-w-0 p-3 border-b space-y-4 ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
                  <div className="space-y-2">
                    <label className={`text-sm font-medium flex items-center gap-2 ${isDarkMode ? 'text-white/80' : 'text-gray-700'}`}>
                      <Zap className={`h-4 w-4 ${isDarkMode ? 'text-white/60' : 'text-gray-600'}`} />
                      Select Model
                    </label>
                    <Select value={normalizeModelBackend(preferredModel)} onValueChange={(v) => setPreferredModel(v as ModelBackend)}>
                      <SelectTrigger className={`h-8 text-sm ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-200'}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className={isDarkMode ? 'bg-black border-white/10 text-white' : ''}>
                        <SelectItem value="local-nemotron" className={isDarkMode ? 'focus:bg-white/10 focus:text-white' : ''}>
                          ⚡ Nemotron 3.5 Lightning (30B)
                        </SelectItem>
                        <SelectItem value="local-qwen" className={isDarkMode ? 'focus:bg-white/10 focus:text-white' : ''}>
                          🧠 Qwen3.6 (35B-A3B)
                        </SelectItem>
                        <SelectItem value="local-nano" className={isDarkMode ? 'focus:bg-white/10 focus:text-white' : ''}>
                          🍃 Nemotron 3 Nano (4B)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className={`text-sm font-medium flex items-center gap-2 ${isDarkMode ? 'text-white/80' : 'text-gray-700'}`}>
                      <FileText className={`h-4 w-4 ${isDarkMode ? 'text-white/60' : 'text-gray-600'}`} />
                      Select Document
                    </label>
                    <Select
                      value={encodeDocValue(selectedClassId, selectedDocument)}
                      onValueChange={(value) => {
                        const splitAt = value.indexOf(DOC_SEPARATOR)
                        setSelectedClassId(value.slice(0, splitAt))
                        setSelectedDocument(value.slice(splitAt + DOC_SEPARATOR.length))
                      }}
                    >
                      <SelectTrigger className={`h-8 text-sm ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-200'}`}>
                        <SelectValue placeholder="Select document..." />
                      </SelectTrigger>
                      <SelectContent className={isDarkMode ? 'bg-black border-white/10 text-white' : ''}>
                        {classes.map((classItem) => {
                          const sectorDocs = documents.filter((doc) => doc.classId === classItem.id)
                          return (
                            <div key={classItem.id}>
                              <div className={`px-2 py-1.5 text-xs font-semibold ${isDarkMode ? 'text-white/50' : 'text-gray-600'}`}>
                                {classItem.name}
                              </div>
                              <SelectItem value={encodeDocValue(classItem.id, "")} className={isDarkMode ? 'focus:bg-white/10 focus:text-white' : ''}>
                                <span className={`text-sm font-semibold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>📚 All documents</span>
                              </SelectItem>
                              {sectorDocs.map((doc) => (
                                <SelectItem
                                  key={encodeDocValue(doc.classId, doc.fileName)}
                                  value={encodeDocValue(doc.classId, doc.fileName)}
                                  className={isDarkMode ? 'focus:bg-white/10 focus:text-white' : ''}
                                >
                                  <span className="text-sm">{doc.fileName}</span>
                                </SelectItem>
                              ))}
                            </div>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    <p className={`text-xs ${isDarkMode ? 'text-white/50' : 'text-gray-500'}`}>
                      {isLoadingDocuments
                        ? 'Loading documents...'
                        : documents.length === 0
                          ? 'No documents available yet.'
                          : selectedDocument
                            ? `Answering from ${selectedDocument}`
                            : `Answering from all ${documents.length} document${documents.length === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className={`text-sm font-medium flex items-center gap-2 ${isDarkMode ? 'text-white/80' : 'text-gray-700'}`}>Chat Type</label>
                    <Select value={chatType} onValueChange={(val) => { setChatType(val as ChatType); if (val === 'syllabus') { setDeepThinking(false); setAttachments([]); setAttachmentPreviews([]); } }}>
                      <SelectTrigger className={`h-8 text-sm ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-200'}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className={isDarkMode ? 'bg-black border-white/10 text-white' : ''}>
                        <SelectItem value="class_material" className={isDarkMode ? 'focus:bg-white/10 focus:text-white' : ''}>
                          <div className="flex items-center gap-2">
                            <BookOpen className="h-3 w-3" />
                            <span className="text-sm">Training Material</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="syllabus" className={isDarkMode ? 'focus:bg-white/10 focus:text-white' : ''}>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3 w-3" />
                            <span className="text-sm">Policies</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* New Chat Button - ChatGPT Style */}
              <div className={`min-w-0 p-3 border-b ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
                <Button
                  onClick={createNewConversation}
                  className={`w-full justify-start gap-3 h-9 text-sm font-medium ${isDarkMode
                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                >
                  <Plus className="h-4 w-4" />
                  <span className="text-sm font-medium">New chat</span>
                </Button>
              </div>

              {/* Conversations List - pr-8 insets cards from the right so they fit clear of scrollbar */}
              <div className="flex-1 overflow-hidden flex flex-col min-h-0 min-w-0">
                <ScrollArea className="flex-1 h-full w-full min-w-0 overflow-x-hidden">
                  <div className="pl-2 pr-8 pt-2 pb-2 space-y-2 min-w-0 max-w-full">
                    {!selectedClassId ? (
                      <div className="text-center py-8 px-4">
                        <MessageSquare className={`mx-auto h-8 w-8 mb-2 ${isDarkMode ? 'text-white/20' : 'text-gray-400'}`} />
                        <p className={`text-xs ${isDarkMode ? 'text-white/40' : 'text-gray-500'}`}>Select a document to start</p>
                      </div>
                    ) : !conversations || conversations.length === 0 ? (
                      <div className="text-center py-8 px-4">
                        <MessageSquare className={`mx-auto h-8 w-8 mb-2 ${isDarkMode ? 'text-white/20' : 'text-gray-400'}`} />
                        <p className={`text-xs ${isDarkMode ? 'text-white/40' : 'text-gray-500'}`}>No conversations yet</p>
                      </div>
                    ) : (
                      conversations.map((conversation) => (
                        <Card
                          key={conversation.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => loadConversation(conversation.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              loadConversation(conversation.id)
                            }
                          }}
                          className={`p-3 cursor-pointer transition-colors group min-w-0 max-w-full overflow-hidden w-full ${currentConversation?.id === conversation.id
                            ? isDarkMode ? "bg-white/10 border-white/20" : "bg-accent border-accent"
                            : isDarkMode ? "bg-transparent border-white/10 hover:bg-white/5" : "hover:bg-accent border-border"
                            }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0 pr-2">
                              <p className={`font-medium text-sm truncate w-full ${currentConversation?.id === conversation.id ? isDarkMode ? "text-white" : "text-gray-900" : isDarkMode ? "text-white/90" : "text-gray-800"}`}>
                                {getConversationCardTitle(conversation)}
                              </p>
                              <p className={`text-xs mt-1 truncate ${isDarkMode ? "text-white/50" : "text-muted-foreground"}`}>
                                {new Date(conversation.updatedAt).toLocaleDateString()} • {conversation.messageHistory?.length ?? 0} messages
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className={`h-6 w-6 p-0 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${isDarkMode ? "hover:bg-red-500/20 text-red-400 hover:text-red-300" : "hover:bg-red-100 text-red-600 hover:text-red-700"}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                e.preventDefault()
                                deleteConversation(conversation.id)
                              }}
                              title="Delete conversation"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </Card>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        )}

        {/* Main Chat Area */}
        <div className={`flex-1 flex flex-col overflow-hidden relative ${isDarkMode ? 'bg-black' : 'bg-white'}`}>
          {/* Chat Header: when sidebar is full, only show minimal bar (sidebar toggle + Export); otherwise show model/class/corpus */}
          <div className={`border-b ${isDarkMode ? 'border-white/10 bg-black' : 'border-gray-200 bg-white'} px-4 py-2.5 flex items-center justify-between`}>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {sidebarLayout !== 'full' && (
                <>
                  {/* Model Selector */}
                  <Select value={normalizeModelBackend(preferredModel)} onValueChange={(value) => setPreferredModel(value as ModelBackend)}>
                    <SelectTrigger className={`h-8 w-[210px] text-sm ${isDarkMode ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={isDarkMode ? 'bg-black border-white/10 text-white' : ''}>
                      <SelectItem value="local-nemotron" className={isDarkMode ? 'focus:bg-white/10 focus:text-white' : ''}>
                        <span className="text-sm">⚡ Nemotron 3.5 Lightning (30B)</span>
                      </SelectItem>
                      <SelectItem value="local-qwen" className={isDarkMode ? 'focus:bg-white/10 focus:text-white' : ''}>
                        <span className="text-sm">🧠 Qwen3.6 (35B-A3B)</span>
                      </SelectItem>
                      <SelectItem value="local-nano" className={isDarkMode ? 'focus:bg-white/10 focus:text-white' : ''}>
                        <span className="text-sm">🍃 Nemotron 3 Nano (4B)</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={encodeDocValue(selectedClassId, selectedDocument)}
                    onValueChange={(value) => {
                      const splitAt = value.indexOf(DOC_SEPARATOR)
                      setSelectedClassId(value.slice(0, splitAt))
                      setSelectedDocument(value.slice(splitAt + DOC_SEPARATOR.length))
                    }}
                  >
                    <SelectTrigger className={`h-8 w-[200px] text-sm ${isDarkMode ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                      <SelectValue placeholder="Select document..." />
                    </SelectTrigger>
                    <SelectContent className={isDarkMode ? 'bg-black border-white/10 text-white' : ''}>
                      {classes.map((classItem) => {
                        const sectorDocs = documents.filter((doc) => doc.classId === classItem.id)
                        return (
                          <div key={classItem.id}>
                            <div className={`px-2 py-1.5 text-xs font-semibold ${isDarkMode ? 'text-white/50' : 'text-gray-600'}`}>
                              {classItem.name}
                            </div>
                            <SelectItem value={encodeDocValue(classItem.id, "")} className={isDarkMode ? 'focus:bg-white/10 focus:text-white' : ''}>
                              <span className={`text-sm font-semibold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>📚 All documents</span>
                            </SelectItem>
                            {sectorDocs.map((doc) => (
                              <SelectItem
                                key={encodeDocValue(doc.classId, doc.fileName)}
                                value={encodeDocValue(doc.classId, doc.fileName)}
                                className={isDarkMode ? 'focus:bg-white/10 focus:text-white' : ''}
                              >
                                <span className="text-sm">{doc.fileName}</span>
                              </SelectItem>
                            ))}
                          </div>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  <Select value={chatType} onValueChange={(val) => { setChatType(val as ChatType); if (val === 'syllabus') { setDeepThinking(false); setAttachments([]); setAttachmentPreviews([]); } }}>
                    <SelectTrigger className={`h-8 w-[160px] text-sm ${isDarkMode ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={isDarkMode ? 'bg-black border-white/10 text-white' : ''}>
                      <SelectItem value="class_material" className={isDarkMode ? 'focus:bg-white/10 focus:text-white' : ''}>
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-3 w-3" />
                          <span className="text-sm">Training Material</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="syllabus" className={isDarkMode ? 'focus:bg-white/10 focus:text-white' : ''}>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          <span className="text-sm">Policies</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
            {currentConversation && (
              <Button
                size="sm"
                variant="ghost"
                onClick={exportChat}
                className={`h-8 gap-2 ${isDarkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-gray-100 text-gray-900'}`}
                title="Export chat"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline text-sm">Export</span>
              </Button>
            )}
          </div>

          {/* Chat Content */}
          <>

            {!currentConversation ? (
              <div className={`flex-1 flex items-center justify-center p-8 ${isDarkMode ? 'bg-black' : ''}`}>
                <div className="text-center max-w-md">
                  <div className={`p-4 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center ${isDarkMode ? 'bg-white/5 border border-white/10' : 'bg-blue-100'}`}>
                    <MessageSquare className={`h-10 w-10 ${isDarkMode ? 'text-white' : 'text-blue-600'}`} />
                  </div>
                  <h2 className={`text-2xl font-bold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Start a conversation</h2>
                  {isCheckingCorpus ? (
                    <p className={`mb-6 ${isDarkMode ? 'text-white' : 'text-gray-600'}`}>
                      Checking corpus...
                    </p>
                  ) : hasCorpusPdfs === false && selectedClassId ? (
                    <>
                      <p className={`mb-6 ${isDarkMode ? 'text-white' : 'text-gray-600'}`}>
                        No PDFs have been uploaded for this class yet. Please ask your faculty to upload course materials before you can start chatting.
                      </p>
                      <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-yellow-900/20 border border-yellow-700/50' : 'bg-yellow-50 border border-yellow-200'}`}>
                        <p className={`text-sm ${isDarkMode ? 'text-yellow-300' : 'text-yellow-800'}`}>
                          📚 Chat is disabled until course materials (PDFs) are uploaded and indexed.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className={`mb-6 ${isDarkMode ? 'text-white' : 'text-gray-600'}`}>
                        {selectedDocument
                          ? `Ask me anything about ${selectedDocument}.`
                          : selectedClassId
                            ? `Ask me anything about ${classes.find(c => c.id === selectedClassId)?.name || 'your sector'}. I'm here to help you get up to speed.`
                            : "Pick a document to start chatting with the assistant"
                        }
                      </p>
                      <Button
                        size="lg"
                        onClick={createNewConversation}
                        disabled={!selectedClassId || hasCorpusPdfs === false}
                        className={isDarkMode
                          ? 'bg-blue-600 hover:bg-blue-500 text-white'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }
                      >
                        <Plus className="h-5 w-5 mr-2" />
                        New Chat
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Messages */}
                <div className={`flex-1 overflow-y-auto p-6 ${isDarkMode ? 'bg-black' : 'bg-white'}`} ref={scrollRef}>
                  <div className="max-w-4xl mx-auto space-y-6">
                    {!currentConversation || !currentConversation.messageHistory || currentConversation.messageHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16">
                        <div className={`w-16 h-16 rounded-full ${isDarkMode ? 'bg-white/5 border border-white/10' : 'bg-gray-100'} flex items-center justify-center mb-4`}>
                          <MessageSquare className={`w-8 h-8 ${isDarkMode ? 'text-white' : 'text-gray-400'}`} />
                        </div>
                        <p className={`text-lg font-medium ${isDarkMode ? 'text-white' : 'text-gray-600'}`}>
                          Start a conversation
                        </p>
                        <p className={`text-sm ${isDarkMode ? 'text-white' : 'text-gray-500'} mt-2`}>
                          Send a message to begin learning
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

                {/* Input Area */}
                <div className={`border-t p-6 ${isDarkMode ? 'bg-black border-white/10' : 'bg-white/80 backdrop-blur-sm'}`}>
                  <div className="max-w-4xl mx-auto">
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

                    {/* Documents in this chat - persistent attachments in context */}
                    {currentConversation?.cachedContext?.persistent_attachments?.length > 0 && (
                      <div className={`flex flex-wrap items-center gap-2 mb-2 ${isDarkMode ? 'text-white/80' : 'text-gray-600'}`}>
                        <span className="text-xs font-medium shrink-0">Documents in this chat:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {currentConversation.cachedContext.persistent_attachments.map((att: { name?: string }, i: number) => (
                            <span
                              key={i}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs ${isDarkMode ? 'bg-white/10 text-white/90' : 'bg-gray-200 text-gray-700'}`}
                              title={att.name}
                            >
                              <File className="h-3 w-3 shrink-0 opacity-70" />
                              <span className="max-w-[120px] truncate">{att.name || 'Document'}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Images in this chat - persistent image attachments (no download icon) */}
                    {currentConversation?.cachedContext?.persistent_images?.length > 0 && (
                      <div className={`flex flex-wrap items-center gap-2 mb-2 ${isDarkMode ? 'text-white/80' : 'text-gray-600'}`}>
                        <span className="text-xs font-medium shrink-0">Images in this chat:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {currentConversation.cachedContext.persistent_images.map((att: { name?: string }, i: number) => (
                            <span
                              key={i}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs ${isDarkMode ? 'bg-white/10 text-white/90' : 'bg-gray-200 text-gray-700'}`}
                              title={att.name}
                            >
                              <ImageIcon className="h-3 w-3 shrink-0 opacity-70" />
                              <span className="max-w-[120px] truncate">{att.name || 'Image'}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className={`flex items-center gap-4 px-5 py-3.5 rounded-3xl ${isDarkMode
                      ? 'bg-white/5 border border-white/10 hover:border-white/20'
                      : 'bg-gray-50 border border-gray-200'
                      } shadow-lg transition-all duration-300 ease-out focus-within:shadow-2xl ${isDarkMode ? 'focus-within:border-white/30 focus-within:bg-white/[0.07]' : 'focus-within:border-blue-500'}`}>
                      {/* File Upload Button - Pin Icon */}
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
                        onClick={() => chatType !== 'syllabus' && fileInputRef.current?.click()}
                        disabled={loading || chatType === 'syllabus' || hasCorpusPdfs === false || (
                          ((currentConversation?.cachedContext?.persistent_attachments?.length || 0) + attachments.filter(f => !f.type.startsWith('image/')).length >= 3) &&
                          ((currentConversation?.cachedContext?.persistent_images?.length || 0) + attachments.filter(f => f.type.startsWith('image/')).length >= 3)
                        )}
                        className={`h-8 w-8 ${chatType === 'syllabus' ? 'opacity-50 cursor-not-allowed' : ''} ${isDarkMode ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
                        title={chatType === 'syllabus' ? 'Attachments not available for Syllabus/Schedule chat' : 'Attach file or image'}
                      >
                        <Paperclip className="h-4 w-4" />
                      </Button>

                      {/* Deep Thinking Mode - Brain Icon (only for Class Material) */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={toggleDeepThinking}
                        disabled={loading || chatType === 'syllabus' || (hasCorpusPdfs === false)}
                        className={`h-8 w-8 ${chatType === 'syllabus' ? 'opacity-50 cursor-not-allowed' : ''} ${deepThinking ? (isDarkMode ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-700') : isDarkMode ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
                        title={chatType === 'syllabus' ? 'Deep thinking is only for Training Material chat' : (hasCorpusPdfs === false ? "Deep thinking mode requires uploaded documents" : "Deep thinking mode")}
                      >
                        <Brain className={`h-4 w-4 ${deepThinking ? 'text-purple-500' : ''}`} />
                      </Button>

                      <Input
                        placeholder={hasCorpusPdfs === false && selectedClassId ? "No documents uploaded yet..." : "Message LearnBOT..."}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        disabled={loading || hasCorpusPdfs === false}
                        className={`flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base ${isDarkMode ? 'text-white placeholder:text-white/50' : 'text-gray-900 placeholder:text-gray-500'
                          }`}
                      />

                      {/* Opens the full-screen voice view instead of dictating into this box. */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push("/voice")}
                        className={`h-8 w-8 ${isDarkMode ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
                        title="Talk to the assistant"
                        aria-label="Talk to the assistant"
                      >
                        <Mic className="h-4 w-4" />
                      </Button>

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
          </>

        </div>
      </div>
    </div>
  )
}
