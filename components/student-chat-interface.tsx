"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LogoutButton } from "@/components/logout-button"
import { ChatMessage } from "@/components/chat-message"
import { MessageSquare, Send, Plus, Bot, Wifi, WifiOff, BookOpen, Trash2, Zap, Calendar, PanelLeftClose, PanelLeftOpen, Sun, Moon, Download, Clock, FileText, FolderOpen, ChevronLeft, ChevronRight, X, ExternalLink, Upload, CheckCircle2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import type { RAGConversation, Class, ModelBackend, Assignment } from "@/lib/types"

type ChatType = "class_material" | "syllabus"

export function StudentChatInterface() {
  const [conversations, setConversations] = useState<RAGConversation[]>([])
  const [currentConversation, setCurrentConversation] = useState<RAGConversation | null>(null)
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [userName, setUserName] = useState("")
  const [selectedClassId, setSelectedClassId] = useState<string>("")
  const [chatType, setChatType] = useState<ChatType>("class_material")
  const [preferredModel, setPreferredModel] = useState<ModelBackend>("claude")
  const [classes, setClasses] = useState<Class[]>([])
  const [ragStatus, setRagStatus] = useState<{
    isAvailable: boolean
    ollamaAvailable: boolean
  }>({ isAvailable: false, ollamaAvailable: false })
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(256) // Default 256px (w-64)
  const [isResizing, setIsResizing] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true) // Track if we should auto-scroll
  const isScrollingProgrammaticallyRef = useRef(false) // Track if we're programmatically scrolling
  const prevConversationIdsRef = useRef<string>('') // Track previous conversation IDs for auto-resort
  const sidebarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadUserData()
    loadClasses()
    loadConversations()
    checkRAGStatus()
    
    // Load sidebar state from localStorage
    const savedSidebarState = localStorage.getItem("studentSidebarCollapsed")
    if (savedSidebarState !== null) {
      setIsSidebarCollapsed(savedSidebarState === "true")
    }
    
    // Load sidebar width from localStorage
    const savedWidth = localStorage.getItem("studentSidebarWidth")
    if (savedWidth !== null) {
      const width = parseInt(savedWidth, 10)
      if (width >= 200 && width <= 500) { // Valid range
        setSidebarWidth(width)
      }
    }
    
    // Load dark mode state from localStorage
    const savedDarkMode = localStorage.getItem("studentDarkMode")
    if (savedDarkMode !== null) {
      setIsDarkMode(savedDarkMode === "true")
    }
    
    // Preload user's classes on mount (after RAG is ready)
    const preloadUserClasses = async () => {
      const userId = localStorage.getItem("userId")
      const userRole = localStorage.getItem("userRole") as 'student' | 'faculty' | null
      
      if (userId && userRole) {
        // Wait a bit for RAG service to initialize
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        try {
          const response = await fetch('/api/rag/preload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, userRole })
          })
          
          if (response.ok) {
            const result = await response.json()
            console.log(`[Student Chat] Preload result: ${result.loaded}/${result.total} stores loaded`)
          } else if (response.status === 503) {
            // RAG not ready yet, retry after a delay
            setTimeout(preloadUserClasses, 3000)
          } else {
            console.warn('[Student Chat] Preload failed:', await response.text())
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

  useEffect(() => {
    if (selectedClassId) {
      loadConversations()
    }
  }, [selectedClassId])

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
      // Check RAG service status
      const ragResponse = await fetch('/api/rag/status')
      const ragData = ragResponse.ok ? await ragResponse.json() : { isAvailable: false }
      
      // Check Ollama status as fallback
      const ollamaResponse = await fetch('/api/ollama/status')
      const ollamaData = ollamaResponse.ok ? await ollamaResponse.json() : { isRunning: false, modelAvailable: false }
      
      setRagStatus({
        isAvailable: ragData.isAvailable || false,
        ollamaAvailable: ollamaData.isRunning && ollamaData.modelAvailable
      })
    } catch (error) {
      console.error('Failed to check AI status:', error)
    }
  }

  // Helper function to sanitize content chunks during streaming (optimized character whitelist)
  const sanitizeContentChunk = (content: string): string => {
    if (!content) return content
    
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
      // Allow: ASCII (0-127), safe Unicode ranges only
      if (code <= 127 || 
          (code >= 0x2000 && code <= 0x206F) ||  // General Punctuation
          (code >= 0x20A0 && code <= 0x20CF) ||  // Currency symbols
          (code >= 0x2100 && code <= 0x214F) ||  // Letterlike Symbols
          (code >= 0x2190 && code <= 0x21FF) ||  // Arrows
          (code >= 0x2200 && code <= 0x22FF) ||  // Mathematical Operators
          (code >= 0x2300 && code <= 0x23FF) ||  // Miscellaneous Technical
          (code >= 0x2400 && code <= 0x243F) ||  // Control Pictures
          (code >= 0x25A0 && code <= 0x25FF) ||  // Geometric Shapes
          (code >= 0xFE00 && code <= 0xFE0F) ||   // Variation Selectors
          (code >= 0xFE20 && code <= 0xFE2F)) {   // Combining Half Marks
        result += content[i]
      }
      // Skip all other characters (emojis, complex Unicode, corrupted sequences)
    }
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
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight
          shouldAutoScrollRef.current = true
          setTimeout(() => {
            isScrollingProgrammaticallyRef.current = false
          }, 100)
        }
      })
    }
  }, [currentConversation?.id]) // Only when conversation ID changes, not on every message update

  const loadUserData = async () => {
    const sessionId = localStorage.getItem("sessionId")
    if (!sessionId) return

    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      })

      if (response.ok) {
        const data = await response.json()
        setUserName(data.user.name)
      }
    } catch (error) {
      console.error("[v0] Failed to load user data:", error)
    }
  }

  const loadClasses = async () => {
    const userId = localStorage.getItem("userId")
    if (!userId) return

    try {
      const response = await fetch(`/api/classes?studentId=${userId}`)
      if (response.ok) {
        const data = await response.json()
        setClasses(data.classes || [])
        // Auto-select first class if available
        if (data.classes && data.classes.length > 0) {
          setSelectedClassId(data.classes[0].id)
        }
      } else {
        console.error("[v0] Failed to load classes:", response.status, response.statusText)
        setClasses([])
      }
    } catch (error) {
      console.error("[v0] Failed to load classes:", error)
      setClasses([])
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

      const url = `/api/chat/conversations?userId=${userId}&classId=${selectedClassId}&chatType=${chatType}`
      
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        console.log("[v0] Conversations API response:", data)
        
        // Ensure conversations is an array and sort by updatedAt (newest first)
        const conversations = Array.isArray(data.conversations) ? data.conversations : []
        
        // Helper function to get date value (handles both Date objects and strings)
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
        
        // Sort in reverse chronological order (newest first) - ChatGPT style
        // Prioritize updatedAt, fallback to createdAt
        const sortedConversations = [...conversations].sort((a, b) => {
          const dateA = getDateValue(a.updatedAt) || getDateValue(a.createdAt) || 0
          const dateB = getDateValue(b.updatedAt) || getDateValue(b.createdAt) || 0
          
          // If dates are equal, sort by ID as tiebreaker (newer IDs first)
          if (dateB === dateA) {
            return parseInt(b.id) - parseInt(a.id)
          }
          
          return dateB - dateA // Descending order (newest first)
        })
        
        setConversations(sortedConversations)
      } else {
        console.error("[v0] Failed to load conversations:", response.status, response.statusText)
        setConversations([])
      }
    } catch (error) {
      console.error("[v0] Failed to load conversations:", error)
      setConversations([])
    }
  }

  const loadConversation = async (conversationId: string) => {
    try {
      const response = await fetch(`/api/chat/conversations/${conversationId}`)
      if (response.ok) {
        const data = await response.json()
        setCurrentConversation(data.conversation)
        // Reset auto-scroll when loading a conversation
        shouldAutoScrollRef.current = true
        // Don't close the history pane when loading a conversation
      }
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
      const response = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, classId: selectedClassId, chatType }),
      })

      if (response.ok) {
        const data = await response.json()
        setCurrentConversation(data.conversation)
        // Reset auto-scroll when creating a new conversation
        shouldAutoScrollRef.current = true
        await loadConversations()
      }
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
      const response = await fetch(`/api/chat/conversations?conversationId=${conversationId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        console.log("[v0] Conversation deleted successfully")
        // Don't reload - optimistic update is sufficient and maintains order
      } else {
        // Revert optimistic update on error
        console.error("[v0] Failed to delete conversation:", response.status, response.statusText)
        loadConversations() // Reload to restore correct state
      }
    } catch (error) {
      // Revert optimistic update on error
      console.error("[v0] Failed to delete conversation:", error)
      loadConversations() // Reload to restore correct state
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
    setInput("")
    setLoading(true)
    // Reset auto-scroll when sending a new message
    shouldAutoScrollRef.current = true

    // Track time to first token (TTFT)
    const sendTimestamp = Date.now()
    let firstTokenTimestamp: number | null = null

    // Add user message to conversation immediately for instant display
    const userMessageObj = {
      role: "user" as const,
      content: userMessage,
      timestamp: new Date(),
      metadata: {}
    }
    
    // Update current conversation state immediately
    setCurrentConversation(prev => {
      if (!prev) return prev
      return {
        ...prev,
        messageHistory: [...(prev.messageHistory || []), userMessageObj]
      }
    })

    // Force scroll to bottom immediately after adding user message
    setTimeout(() => {
      if (scrollRef.current) {
        isScrollingProgrammaticallyRef.current = true
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        shouldAutoScrollRef.current = true
        setTimeout(() => {
          isScrollingProgrammaticallyRef.current = false
        }, 100)
      }
    }, 0)

    try {
      console.log("[v0] Starting fetch request to /api/chat/ai-response (STREAMING)")
      console.log("[v0] Request body:", { message: userMessage, userId, sessionId: currentConversation.id })
      
      // Send message with streaming enabled
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 120000) // 2 minute timeout
      
      const response = await fetch("/api/chat/ai-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          userId,
          sessionId: currentConversation.id,
          classId: selectedClassId,
          chatType: chatType,
          preferredModel: preferredModel,
          stream: true, // Enable streaming
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)
      console.log("[v0] Fetch request started, status:", response.status)

      if (response.ok) {
        // Check if response is streaming (SSE)
        const contentType = response.headers.get('content-type')
        if (contentType?.includes('text/event-stream')) {
          console.log("[v0] Streaming response detected")
          
          // Create placeholder for assistant message
          const assistantMessageObj = {
            role: "assistant" as const,
            content: "",
            timestamp: new Date(),
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
                              scrollRef.current.scrollTop = scrollRef.current.scrollHeight
                              // Reset flag quickly
                              setTimeout(() => {
                                isScrollingProgrammaticallyRef.current = false
                              }, 10)
                            }
                          })
                        } else {
                          // User has scrolled up, disable auto-scroll
                          shouldAutoScrollRef.current = false
                        }
                      }
                    }
                    
                    if (data.done) {
                      console.log("[v0] Streaming completed")
                      break
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
          
          // Reload conversation to get the saved version from DB
          console.log("[v0] Reloading conversation:", currentConversation.id)
          await loadConversation(currentConversation.id)
          await loadConversations()
          console.log("[v0] Conversation reloaded successfully")
          
          // Merge frontend timing metrics with DB data
          setCurrentConversation(prev => {
            if (!prev || !prev.messageHistory) return prev
            const messages = [...prev.messageHistory]
            if (messages.length > 0) {
              const lastMsg = messages[messages.length - 1]
              if (lastMsg.role === 'assistant') {
                messages[messages.length - 1] = {
                  ...lastMsg,
                  metadata: {
                    ...lastMsg.metadata,
                    timeToFirstToken: ttft,
                    totalResponseTime: totalResponseTime
                  }
                }
              }
            }
            return { ...prev, messageHistory: messages }
          })
        } else {
          // Non-streaming response (fallback)
          const responseData = await response.json()
          console.log("[v0] Non-streaming AI response received:", responseData)
          
          // Reload the conversation to get the complete updated messages from database
          console.log("[v0] Reloading conversation:", currentConversation.id)
          await loadConversation(currentConversation.id)
          await loadConversations()
          console.log("[v0] Conversation reloaded successfully")
        }
      } else {
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
    const newState = !isDarkMode
    setIsDarkMode(newState)
    localStorage.setItem("studentDarkMode", String(newState))
  }

  // Handle sidebar resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      
      const newWidth = e.clientX
      // Constrain width between 200px and 500px
      if (newWidth >= 200 && newWidth <= 500) {
        setSidebarWidth(newWidth)
        localStorage.setItem("studentSidebarWidth", String(newWidth))
      }
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
      const response = await fetch(`/api/classes/resources/download?classId=${resourcesClassId}&fileName=${encodeURIComponent(resources[index].name)}&userId=${userId}`)
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
        const response = await fetch(`/api/classes/resources/download?classId=${resourcesClassId}&fileName=${encodeURIComponent(resources[index].name)}`)
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
    exportContent += `Student: ${userName}\n`
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
        const timestamp = new Date(message.timestamp).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true
        })
        
        exportContent += `${role} (${timestamp})\n`
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

  return (
    <div className={`h-screen flex flex-col overflow-hidden ${isDarkMode ? 'dark bg-black' : 'bg-gradient-to-br from-gray-50 to-blue-50/20'}`}>
      {/* Header */}
      <header className={`border-b shadow-sm ${isDarkMode ? 'bg-black border-white/10' : 'bg-white/80'} backdrop-blur-sm`}>
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <img 
              src="/learnbot-logo.png" 
              alt="LearnBOT Logo" 
              className="h-12 w-12 object-contain"
            />
            <div>
              <h1 className={`font-semibold text-lg ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>LearnBOT</h1>
              <p className={`text-sm ${isDarkMode ? 'text-white/60' : 'text-gray-600'}`}>Welcome, {userName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Dark Mode Toggle */}
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

      <div className="flex-1 flex overflow-hidden">
        {/* Collapsed Sidebar - Very narrow strip with expand button */}
        {isSidebarCollapsed && (
          <div className={`w-12 border-r shadow-sm transition-all duration-300 ease-in-out ${isDarkMode ? 'bg-black border-white/10' : 'bg-white'} flex flex-col items-center py-4`}>
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

        {/* Sidebar - ChatGPT Style */}
        {!isSidebarCollapsed && (
        <div 
          ref={sidebarRef}
          className={`border-r transition-all duration-200 ease-in-out ${isDarkMode ? 'bg-black border-white/10' : 'bg-white border-gray-200'} flex flex-col relative`}
          style={{ width: `${sidebarWidth}px`, minWidth: '200px', maxWidth: '500px' }}
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
          
          {/* New Chat Button - ChatGPT Style */}
          <div className={`p-3 border-b ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
            <Button 
              onClick={createNewConversation} 
              className={`w-full justify-start gap-3 h-9 ${isDarkMode ? 'bg-white/5 hover:bg-white/10 text-white border border-white/10' : 'bg-white hover:bg-gray-50 text-gray-900 border border-gray-200'}`}
            >
              <Plus className="h-4 w-4" />
              <span className="text-sm font-medium">New chat</span>
            </Button>
          </div>

          {/* Conversations List - ChatGPT Style */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <ScrollArea className="flex-1 h-full">
              <div className="p-2 space-y-1">
                {!selectedClassId ? (
                  <div className="text-center py-8 px-4">
                    <MessageSquare className={`mx-auto h-8 w-8 mb-2 ${isDarkMode ? 'text-white/20' : 'text-gray-400'}`} />
                    <p className={`text-xs ${isDarkMode ? 'text-white/40' : 'text-gray-500'}`}>Select a class to start</p>
                  </div>
                ) : !conversations || conversations.length === 0 ? (
                  <div className="text-center py-8 px-4">
                    <MessageSquare className={`mx-auto h-8 w-8 mb-2 ${isDarkMode ? 'text-white/20' : 'text-gray-400'}`} />
                    <p className={`text-xs ${isDarkMode ? 'text-white/40' : 'text-gray-500'}`}>No conversations yet</p>
                  </div>
                ) : (
                  conversations.map((conversation) => (
                    <div
                      key={conversation.id}
                      className={`w-full rounded-lg transition-colors group relative ${
                        currentConversation?.id === conversation.id 
                          ? isDarkMode ? "bg-white/10" : "bg-gray-100"
                          : isDarkMode ? "hover:bg-white/5" : "hover:bg-gray-50"
                      }`}
                    >
                      <button
                        onClick={() => loadConversation(conversation.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                          currentConversation?.id === conversation.id 
                            ? isDarkMode ? "text-white" : "text-gray-900"
                            : isDarkMode ? "text-white/70 hover:text-white" : "text-gray-700"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 min-h-[2.5rem]">
                          <p className={`text-sm flex-1 break-words leading-relaxed pr-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            {conversation.conversationSummary || conversation.title}
                          </p>
                          <Button
                            size="sm"
                            variant="ghost"
                            className={`h-6 w-6 p-0 flex-shrink-0 opacity-100 ${isDarkMode ? 'hover:bg-red-500/20 text-red-400 hover:text-red-300' : 'hover:bg-red-50 text-red-500 hover:text-red-600'}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              deleteConversation(conversation.id)
                            }}
                            title="Delete conversation"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
        )}

        {/* Main Chat Area */}
        <div className={`flex-1 flex flex-col overflow-hidden relative ${isDarkMode ? 'bg-black' : 'bg-white'}`}>
          {/* Chat Header - ChatGPT Style with Model/Class Selector */}
          <div className={`border-b ${isDarkMode ? 'border-white/10 bg-black' : 'border-gray-200 bg-white'} px-4 py-2.5 flex items-center justify-between`}>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Model Selector - ChatGPT Style */}
              <Select value={preferredModel} onValueChange={(value) => setPreferredModel(value as ModelBackend)}>
                <SelectTrigger className={`h-8 w-[180px] text-sm ${isDarkMode ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={isDarkMode ? 'bg-black border-white/10 text-white' : ''}>
                  <SelectItem value="claude" className={isDarkMode ? 'focus:bg-white/10 focus:text-white' : ''}>
                    <span className="text-sm">🧠 Claude 4.5 Haiku</span>
                  </SelectItem>
                  <SelectItem value="remote-a6000" className={isDarkMode ? 'focus:bg-white/10 focus:text-white' : ''}>
                    <span className="text-sm">🚀 Remote A6000 (Gemma 27B)</span>
                  </SelectItem>
                  <SelectItem value="remote-blackwell" className={isDarkMode ? 'focus:bg-white/10 focus:text-white' : ''}>
                    <span className="text-sm">⚡ Remote Blackwell (Gemma 27B)</span>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Class Selector */}
              <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                <SelectTrigger className={`h-8 w-[200px] text-sm ${isDarkMode ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                  <SelectValue placeholder="Select class..." />
                </SelectTrigger>
                <SelectContent className={isDarkMode ? 'bg-black border-white/10 text-white' : ''}>
                  <SelectItem value="entire-corpus" className={isDarkMode ? 'focus:bg-white/10 focus:text-white' : ''}>
                    <span className={`text-sm font-semibold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>📚 Entire Corpus</span>
                  </SelectItem>
                  {classes.length > 0 && (
                    <div className={`px-2 py-1.5 text-xs font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Individual Classes
                    </div>
                  )}
                  {classes.map((classItem) => (
                    <SelectItem key={classItem.id} value={classItem.id} className={isDarkMode ? 'focus:bg-white/10 focus:text-white' : ''}>
                      <span className="text-sm">{classItem.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Chat Type Selector */}
              <Select value={chatType} onValueChange={(val) => setChatType(val as ChatType)}>
                <SelectTrigger className={`h-8 w-[160px] text-sm ${isDarkMode ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={isDarkMode ? 'bg-black border-white/10 text-white' : ''}>
                  <SelectItem value="class_material" className={isDarkMode ? 'focus:bg-white/10 focus:text-white' : ''}>
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-3 w-3" />
                      <span className="text-sm">Class Material</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="syllabus" className={isDarkMode ? 'focus:bg-white/10 focus:text-white' : ''}>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3" />
                      <span className="text-sm">Syllabus</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* AI Status Indicator */}
              <div className={`flex items-center gap-2 px-2.5 py-1 rounded-md ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'}`}>
                {ragStatus.isAvailable ? (
                  <div className="flex items-center gap-1.5">
                    <Wifi className={`h-3.5 w-3.5 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                    <span className={`text-xs font-medium ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>RAG</span>
                  </div>
                ) : ragStatus.ollamaAvailable ? (
                  <div className="flex items-center gap-1.5">
                    <Wifi className={`h-3.5 w-3.5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                    <span className={`text-xs font-medium ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>Ollama</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <WifiOff className={`h-3.5 w-3.5 ${isDarkMode ? 'text-orange-400' : 'text-orange-600'}`} />
                    <span className={`text-xs font-medium ${isDarkMode ? 'text-orange-400' : 'text-orange-600'}`}>Fallback</span>
                  </div>
                )}
              </div>
            </div>

            {/* Export Chat Button */}
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
                  <p className={`mb-6 ${isDarkMode ? 'text-white' : 'text-gray-600'}`}>
                    {selectedClassId === 'entire-corpus'
                      ? "Ask me anything across ALL DMSB courses! I'm your universal teaching assistant for the entire business school curriculum."
                      : selectedClassId 
                      ? `Ask me anything about ${classes.find(c => c.id === selectedClassId)?.name || 'this class'}. I'm here to help you learn!`
                      : "Select a class or the Entire Corpus to start chatting with the AI assistant"
                    }
                  </p>
                  <Button 
                    size="lg" 
                    onClick={createNewConversation} 
                    disabled={!selectedClassId}
                    className={isDarkMode ? 'bg-white text-black hover:bg-white/90' : ''}
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    New Chat
                  </Button>
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
                      currentConversation.messageHistory.map((message, index) => (
                        <ChatMessage
                          key={index}
                          role={message.role}
                          content={message.content}
                          timestamp={message.timestamp}
                          metadata={message.metadata}
                          isDarkMode={isDarkMode}
                        />
                      ))
                    )}
                    {loading && (
                      <div className="flex gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex-shrink-0">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            isDarkMode 
                              ? 'bg-white/10 border border-white/20'
                              : 'bg-gradient-to-br from-emerald-400 to-teal-500'
                          } shadow-lg`}>
                            <Bot className="w-4 h-4 text-white" />
                          </div>
                        </div>
                        <div className={`flex-1 max-w-[85%] rounded-2xl px-5 py-4 ${
                          isDarkMode
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
                    <div className={`flex items-center gap-4 px-5 py-3.5 rounded-3xl ${
                      isDarkMode 
                        ? 'bg-white/5 border border-white/10 hover:border-white/20' 
                        : 'bg-gray-50 border border-gray-200'
                    } shadow-lg transition-all duration-300 ease-out focus-within:shadow-2xl ${isDarkMode ? 'focus-within:border-white/30 focus-within:bg-white/[0.07]' : 'focus-within:border-blue-500'}`}>
                      <Input
                        placeholder="Message LearnBOT..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        disabled={loading}
                        className={`flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base ${
                          isDarkMode ? 'text-white placeholder:text-white/50' : 'text-gray-900 placeholder:text-gray-500'
                        }`}
                      />
                      <Button 
                        onClick={sendMessage} 
                        disabled={loading || !input.trim()} 
                        size="icon"
                        className={`rounded-full w-10 h-10 flex items-center justify-center transition-all duration-300 ease-out ${
                          loading || !input.trim()
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
