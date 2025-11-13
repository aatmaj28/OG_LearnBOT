"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LogoutButton } from "@/components/logout-button"
import { MessageSquare, Send, Plus, Bot, Wifi, WifiOff, BookOpen, Trash2, Zap, Calendar, PanelLeftClose, PanelLeftOpen, Sun, Moon, Download, Clock, FileText, FolderOpen, ChevronLeft, ChevronRight, X, ExternalLink, Upload, CheckCircle2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import type { RAGConversation, Class, ModelBackend, Assignment } from "@/lib/types"

type ChatType = "class_material" | "syllabus"
type SidebarTab = "chatHistory" | "assignments" | "resources"

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
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab>("chatHistory")
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(true)
  const [resourcesClassId, setResourcesClassId] = useState<string>("")
  const [resources, setResources] = useState<Array<{ name: string; size: number; uploadedAt: Date | string }>>([])
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [previewResourceIndex, setPreviewResourceIndex] = useState<number | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null)
  const [assignmentsClassId, setAssignmentsClassId] = useState<string>("")
  const [assignments, setAssignments] = useState<Array<{ id: string; name: string; pdfUrl: string; dueDate: string; canvasLink: string; createdAt: string }>>([])
  const [showSubmitDialog, setShowSubmitDialog] = useState(false)
  const [selectedAssignment, setSelectedAssignment] = useState<{ id: string; name: string } | null>(null)
  const [submissionFile, setSubmissionFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submissionFileInputRef = useRef<HTMLInputElement | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true) // Track if we should auto-scroll
  const isScrollingProgrammaticallyRef = useRef(false) // Track if we're programmatically scrolling

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
    
    // Load dark mode state from localStorage
    const savedDarkMode = localStorage.getItem("studentDarkMode")
    if (savedDarkMode !== null) {
      setIsDarkMode(savedDarkMode === "true")
    }
    
    // Poll status every 5 seconds to detect when RAG becomes ready
    const statusInterval = setInterval(checkRAGStatus, 5000)
    
    return () => clearInterval(statusInterval)
  }, [])

  useEffect(() => {
    if (selectedClassId) {
      loadConversations()
    }
  }, [selectedClassId])

  useEffect(() => {
    if (resourcesClassId && activeSidebarTab === "resources") {
      loadStudentResources()
    }
  }, [resourcesClassId, activeSidebarTab])

  useEffect(() => {
    if (classes.length > 0 && !resourcesClassId && activeSidebarTab === "resources") {
      setResourcesClassId(classes[0].id)
    }
  }, [classes, activeSidebarTab])

  useEffect(() => {
    if (assignmentsClassId && activeSidebarTab === "assignments") {
      loadStudentAssignments()
    }
  }, [assignmentsClassId, activeSidebarTab])

  useEffect(() => {
    if (classes.length > 0 && !assignmentsClassId && activeSidebarTab === "assignments") {
      setAssignmentsClassId(classes[0].id)
    }
  }, [classes, activeSidebarTab])

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
        
        // Ensure conversations is an array
        const conversations = Array.isArray(data.conversations) ? data.conversations : []
        setConversations(conversations)
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

    try {
      const response = await fetch(`/api/chat/conversations?conversationId=${conversationId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        await loadConversations()
        if (currentConversation?.id === conversationId) {
          setCurrentConversation(null)
        }
        console.log("[v0] Conversation deleted successfully")
      } else {
        console.error("[v0] Failed to delete conversation:", response.status, response.statusText)
      }
    } catch (error) {
      console.error("[v0] Failed to delete conversation:", error)
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
                      // Track time to first token (only once)
                      if (firstTokenTimestamp === null && data.content.trim()) {
                        firstTokenTimestamp = Date.now()
                        const ttft = firstTokenTimestamp - sendTimestamp
                        console.log(`[v0] ⚡ Time to First Token: ${ttft}ms`)
                      }
                      
                      accumulatedResponse += data.content
                      
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
    <div className={`h-screen flex flex-col overflow-hidden ${isDarkMode ? 'dark bg-gradient-to-br from-gray-900 to-blue-950' : 'bg-gradient-to-br from-gray-50 to-blue-50/20'}`}>
      {/* Header */}
      <header className={`border-b shadow-sm ${isDarkMode ? 'bg-gray-800/90 border-gray-700' : 'bg-white/80'} backdrop-blur-sm`}>
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-md">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className={`font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Student Portal</h1>
              <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Welcome, {userName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Dark Mode Toggle */}
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={toggleDarkMode}
              className={`rounded-lg ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
              title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkMode ? (
                <Sun className="h-5 w-5 text-yellow-400" />
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
          <div className={`w-12 border-r shadow-sm transition-all duration-300 ease-in-out ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'} flex flex-col items-center py-4`}>
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleSidebar}
              className={`w-10 h-10 ${isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-700'}`}
              title="Show sidebar"
            >
              <PanelLeftOpen className={`h-5 w-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`} />
            </Button>
          </div>
        )}

        {/* Sidebar - Collapsible */}
        {!isSidebarCollapsed && (
        <div className={`w-80 border-r shadow-sm transition-all duration-300 ease-in-out ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'} flex flex-col relative`}>
          {/* Sidebar Toggle Button - Positioned on the right edge */}
          <Button
            size="icon"
            variant="ghost"
            onClick={toggleSidebar}
            className={`absolute top-4 right-2 z-20 ${isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-700'}`}
            title="Hide sidebar"
          >
            <PanelLeftClose className={`h-4 w-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`} />
          </Button>
          
          {/* Sidebar Navigation */}
          <div className={`p-4 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <nav className="space-y-2 mt-8">
              <button
                onClick={() => setActiveSidebarTab("chatHistory")}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  activeSidebarTab === "chatHistory"
                    ? isDarkMode ? "bg-gray-700 text-white" : "bg-blue-50 text-blue-700"
                    : isDarkMode ? "text-gray-300 hover:bg-gray-700" : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <Clock className="h-5 w-5" />
                <span className="font-medium">Chat History</span>
              </button>
              <button
                onClick={() => setActiveSidebarTab("assignments")}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  activeSidebarTab === "assignments"
                    ? isDarkMode ? "bg-gray-700 text-white" : "bg-blue-50 text-blue-700"
                    : isDarkMode ? "text-gray-300 hover:bg-gray-700" : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <FileText className="h-5 w-5" />
                <span className="font-medium">Assignments</span>
              </button>
              <button
                onClick={() => setActiveSidebarTab("resources")}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  activeSidebarTab === "resources"
                    ? isDarkMode ? "bg-gray-700 text-white" : "bg-blue-50 text-blue-700"
                    : isDarkMode ? "text-gray-300 hover:bg-gray-700" : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <FolderOpen className="h-5 w-5" />
                <span className="font-medium">Resources</span>
              </button>
            </nav>
          </div>

          {/* Sidebar Content - Only show for Chat History tab */}
          {activeSidebarTab === "chatHistory" && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header with Chat History title and New Chat button */}
                <div className={`px-4 pt-4 pb-3 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'} flex items-center justify-between`}>
                  <h2 className={`font-semibold text-sm ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Chat History</h2>
                  <Button 
                    size="sm" 
                    onClick={createNewConversation} 
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md h-7 px-2 text-xs"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    New Chat
                  </Button>
                </div>

                {/* Collapsible Settings Section */}
                <div className={`border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <button
                    onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
                    className={`w-full px-4 py-2 flex items-center justify-between ${isDarkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'} transition-colors`}
                  >
                    <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Settings</span>
                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} transition-transform ${isSettingsExpanded ? 'rotate-180' : ''}`}>▼</span>
                  </button>
                  {isSettingsExpanded && (
                    <div className="px-4 pb-3 space-y-2.5">
                      {/* Model Selection */}
                      <div>
                        <label className={`text-xs font-medium mb-1 block ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          <Zap className="h-3 w-3 inline mr-1" />
                          Model
                        </label>
                        <Select value={preferredModel} onValueChange={(value) => setPreferredModel(value as ModelBackend)}>
                          <SelectTrigger className={`w-full h-8 text-xs ${isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : ''}`}>
                            <SelectValue placeholder="Select model..." />
                          </SelectTrigger>
                          <SelectContent className={isDarkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : ''}>
                            <SelectItem value="claude" className={isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100' : ''}>
                              <div className="flex items-center gap-2">
                                <span className="text-xs">🧠 Claude 3.5 Sonnet</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="remote-a6000" className={isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100' : ''}>
                              <div className="flex items-center gap-2">
                                <span className="text-xs">🚀 Remote A6000 (Gemma 27B)</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="remote-blackwell" className={isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100' : ''}>
                              <div className="flex items-center gap-2">
                                <span className="text-xs">⚡ Remote Blackwell (Gemma 27B)</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Class Selection */}
                      <div>
                        <label className={`text-xs font-medium mb-1 block ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          <BookOpen className="h-3 w-3 inline mr-1" />
                          Class
                        </label>
                        <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                          <SelectTrigger className={`w-full h-8 text-xs ${isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : ''}`}>
                            <SelectValue placeholder="Select class..." />
                          </SelectTrigger>
                          <SelectContent className={isDarkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : ''}>
                            {/* Entire Corpus Option */}
                            <SelectItem value="entire-corpus" className={isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100' : ''}>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-semibold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>📚 Entire Corpus</span>
                              </div>
                            </SelectItem>
                            {classes.length > 0 && (
                              <div className={`px-2 py-1.5 text-xs font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                Individual Classes
                              </div>
                            )}
                            {classes.map((classItem) => (
                              <SelectItem key={classItem.id} value={classItem.id} className={isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100' : ''}>
                                <span className="text-xs">{classItem.name}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Chat Type Selection */}
                      <div>
                        <label className={`text-xs font-medium mb-1 block ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Chat Type
                        </label>
                        <Select value={chatType} onValueChange={(val) => setChatType(val as ChatType)}>
                          <SelectTrigger className={`w-full h-8 text-xs ${isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : ''}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className={isDarkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : ''}>
                            <SelectItem value="class_material" className={isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100' : ''}>
                              <div className="flex items-center gap-2">
                                <BookOpen className="h-3 w-3" />
                                <span className="text-xs">Class Material</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="syllabus" className={isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100' : ''}>
                              <div className="flex items-center gap-2">
                                <Calendar className="h-3 w-3" />
                                <span className="text-xs">Syllabus/Schedule</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* AI Status Indicator */}
                      <div>
                        <label className={`text-xs font-medium mb-1 block ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          AI Status
                        </label>
                        <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                          <Bot className={`h-3 w-3 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`} />
                          {ragStatus.isAvailable ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <Wifi className="h-2.5 w-2.5" />
                              <span className="text-xs font-medium">RAG</span>
                            </div>
                          ) : ragStatus.ollamaAvailable ? (
                            <div className="flex items-center gap-1 text-blue-600">
                              <Wifi className="h-2.5 w-2.5" />
                              <span className="text-xs font-medium">Ollama Ready</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-orange-600">
                              <WifiOff className="h-2.5 w-2.5" />
                              <span className="text-xs font-medium">Fallback</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Conversations List */}
                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                  <ScrollArea className="flex-1 h-full">
                    <div className="p-4 space-y-2">
                      {!selectedClassId ? (
                        <div className="text-center py-8">
                          <BookOpen className={`mx-auto h-10 w-10 mb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                          <p className={`text-xs mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Select a class to view conversations</p>
                          <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>Choose a class from settings above</p>
                        </div>
                      ) : !conversations || conversations.length === 0 ? (
                        <div className="text-center py-8">
                          <MessageSquare className={`mx-auto h-10 w-10 mb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                          <p className={`text-xs mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>No conversations yet</p>
                          <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>Click "New Chat" to start</p>
                        </div>
                      ) : (
                        conversations.map((conversation) => (
                          <Card
                            key={conversation.id}
                            className={`p-2.5 cursor-pointer transition-colors group ${
                              currentConversation?.id === conversation.id 
                                ? isDarkMode ? "bg-gray-700" : "bg-accent"
                                : isDarkMode ? "hover:bg-gray-700" : "hover:bg-accent"
                            } ${isDarkMode ? 'bg-gray-750 border-gray-700' : ''}`}
                            onClick={() => loadConversation(conversation.id)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <p className={`font-medium text-xs truncate ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>{conversation.title}</p>
                                <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                  {new Date(conversation.updatedAt).toLocaleDateString()} • {conversation.messageHistory.length} messages
                                </p>
                                {conversation.currentTopic && (
                                  <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>Topic: {conversation.currentTopic}</p>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className={`h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity ${isDarkMode ? 'hover:bg-red-900/50 text-red-400 hover:text-red-300' : 'hover:bg-red-100 text-red-600 hover:text-red-700'}`}
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
                  </ScrollArea>
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Chat History Tab Content */}
          {activeSidebarTab === "chatHistory" && (
            <>
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
                  <div className={`p-4 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center ${isDarkMode ? 'bg-blue-900/50' : 'bg-blue-100'}`}>
                    <MessageSquare className={`h-10 w-10 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                  </div>
                  <h2 className={`text-2xl font-bold mb-3 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Start a New Conversation</h2>
                  <p className={`mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    {selectedClassId === 'entire-corpus'
                      ? "Ask me anything across ALL DMSB courses! I'm your universal teaching assistant for the entire business school curriculum."
                      : selectedClassId 
                      ? `Ask me anything about ${classes.find(c => c.id === selectedClassId)?.name || 'this class'}. I'm here to help you learn!`
                      : "Select a class or the Entire Corpus to start chatting with the AI assistant"
                    }
                  </p>
                  <Button size="lg" onClick={createNewConversation} disabled={!selectedClassId}>
                    <Plus className="h-5 w-5 mr-2" />
                    New Chat
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
                  <div className="max-w-3xl mx-auto space-y-4">
                    {!currentConversation || !currentConversation.messageHistory || currentConversation.messageHistory.length === 0 ? (
                      <div className="text-center py-12">
                        <p className="text-muted-foreground">Start the conversation by sending a message below</p>
                      </div>
                    ) : (
                      currentConversation.messageHistory.map((message, index) => (
                        <div
                          key={index}
                          className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg p-4 ${
                              message.role === "user" 
                                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white" 
                                : isDarkMode ? "bg-gray-800 text-gray-100 border border-gray-700" : "bg-gray-100 text-gray-900"
                            }`}
                          >
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <p className="text-xs opacity-70">{new Date(message.timestamp).toLocaleTimeString()}</p>
                              {message.role === "assistant" && message.metadata?.mode && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  message.metadata.mode === 'rag' 
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' 
                                    : message.metadata.mode === 'llm_fallback'
                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                                    : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                                }`}>
                                  {message.metadata.mode === 'rag' ? 'RAG' : message.metadata.mode === 'llm_fallback' ? 'LLM' : 'Error'}
                                </span>
                              )}
                            {message.role === "assistant" && message.metadata?.modelUsed && (
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                                {message.metadata.modelUsed === 'claude' ? '🧠 Claude' : 
                                 message.metadata.modelUsed === 'remote-a6000' ? '🚀 A6000' :
                                 message.metadata.modelUsed === 'remote-blackwell' ? '⚡ Blackwell' :
                                 message.metadata.modelUsed === 'remote-ollama' ? '🚀 A6000' : // backward compatibility
                                 message.metadata.modelUsed}
                              </span>
                            )}
                              {message.role === "assistant" && message.metadata?.timeToFirstToken && (
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                                  ⚡ TTFT: {message.metadata.timeToFirstToken < 1000 ? `${message.metadata.timeToFirstToken}ms` : `${(message.metadata.timeToFirstToken / 1000).toFixed(2)}s`}
                                </span>
                              )}
                              {message.role === "assistant" && message.metadata?.totalResponseTime && (
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                                  🏁 Total: {message.metadata.totalResponseTime < 1000 ? `${message.metadata.totalResponseTime}ms` : `${(message.metadata.totalResponseTime / 1000).toFixed(2)}s`}
                                </span>
                              )}
                              {message.role === "assistant" && message.metadata?.timeTaken && (
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                  ⏱️ {message.metadata.timeTaken < 1000 ? `${message.metadata.timeTaken}ms` : `${(message.metadata.timeTaken / 1000).toFixed(2)}s`}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                    {loading && (
                      <div className="flex justify-start">
                        <div className="bg-muted rounded-lg p-4">
                          <div className="flex gap-2">
                            <div className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                            <div className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Input Area */}
                <div className={`border-t p-4 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
                  <div className="max-w-3xl mx-auto flex gap-2">
                    <Input
                      placeholder="Type your message..."
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyPress={handleKeyPress}
                      disabled={loading}
                      className={`flex-1 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder:text-gray-400' : ''}`}
                    />
                    <Button onClick={sendMessage} disabled={loading || !input.trim()} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
          )}

          {/* Assignments Tab Content */}
          {activeSidebarTab === "assignments" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-6 pb-4 border-b">
                <label className={`text-base font-bold mb-3 block ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>
                  <FileText className="h-5 w-5 inline mr-2" />
                  Select Class
                </label>
                <Select value={assignmentsClassId} onValueChange={setAssignmentsClassId}>
                  <SelectTrigger className={`w-full h-10 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : ''}`}>
                    <SelectValue placeholder="Select a class..." />
                  </SelectTrigger>
                  <SelectContent className={isDarkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : ''}>
                    {classes.map((classItem) => (
                      <SelectItem key={classItem.id} value={classItem.id} className={isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100' : ''}>
                        {classItem.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 overflow-auto p-6">
                {assignments.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <FileText className={`mx-auto h-12 w-12 mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                      <p className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>No assignments yet</p>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>Assignments will appear here when your professor adds them</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {assignments.map((assignment) => (
                      <Card
                        key={assignment.id}
                        className={`p-4 ${isDarkMode ? 'bg-gray-800 border-gray-700 hover:bg-gray-750' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                      >
                        <div className="mb-3">
                          <h3 className={`font-semibold text-lg ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                            {assignment.name}
                          </h3>
                        </div>
                        <div className="space-y-2 mb-4">
                          <div className="flex items-center gap-2">
                            <Calendar className={`h-4 w-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                            <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              Due: {new Date(assignment.dueDate).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              const userId = localStorage.getItem("userId")
                              if (!userId) {
                                toast.error("User not authenticated")
                                return
                              }
                              try {
                                const response = await fetch(`${assignment.pdfUrl}&userId=${userId}`)
                                if (response.ok) {
                                  const blob = await response.blob()
                                  const url = window.URL.createObjectURL(blob)
                                  const link = document.createElement('a')
                                  link.href = url
                                  link.download = assignment.name.replace(/[^a-zA-Z0-9_.-]/g, '_') + '.pdf'
                                  document.body.appendChild(link)
                                  link.click()
                                  document.body.removeChild(link)
                                  window.URL.revokeObjectURL(url)
                                } else {
                                  const errorData = await response.json()
                                  toast.error(errorData.error || "Failed to download assignment")
                                }
                              } catch (error) {
                                console.error("[v0] Failed to download assignment:", error)
                                toast.error("Failed to download assignment")
                              }
                            }}
                            className={`w-full ${isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100 hover:bg-gray-600' : ''}`}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download PDF
                          </Button>
                          {assignment.canvasLink && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                window.open(assignment.canvasLink, '_blank')
                              }}
                              className={`w-full ${isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100 hover:bg-gray-600' : ''}`}
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Open in Canvas
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedAssignment({ id: assignment.id, name: assignment.name })
                              setShowSubmitDialog(true)
                            }}
                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Submit
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Resources Tab Content */}
          {activeSidebarTab === "resources" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-6 pb-4 border-b">
                <label className={`text-base font-bold mb-3 block ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>
                  <BookOpen className="h-5 w-5 inline mr-2" />
                  Select Class
                </label>
                <Select value={resourcesClassId} onValueChange={setResourcesClassId}>
                  <SelectTrigger className={`w-full h-10 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : ''}`}>
                    <SelectValue placeholder="Select a class..." />
                  </SelectTrigger>
                  <SelectContent className={isDarkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : ''}>
                    {classes.map((classItem) => (
                      <SelectItem key={classItem.id} value={classItem.id} className={isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100' : ''}>
                        {classItem.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 overflow-hidden p-6 pt-4">

                {!resourcesClassId ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <BookOpen className={`mx-auto h-12 w-12 mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                      <p className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Select a Class</p>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>Choose a class to view resources</p>
                    </div>
                  </div>
                ) : resources.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <FolderOpen className={`mx-auto h-12 w-12 mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                      <p className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>No resources available</p>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>No files have been uploaded for this class yet</p>
                    </div>
                  </div>
                ) : (
                  <ScrollArea className="flex-1 h-full">
                    <div className="space-y-2">
                      {resources.map((resource, index) => (
                        <Card
                          key={index}
                          className={`p-3 transition-colors group ${
                            isDarkMode 
                              ? 'bg-gray-800 border-gray-700 hover:bg-gray-750' 
                              : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div 
                              className="flex-1 flex items-center gap-3 cursor-pointer min-w-0"
                              onClick={() => openPreview(index)}
                            >
                              <FileText className={`h-5 w-5 flex-shrink-0 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                              <div className="flex-1 min-w-0">
                                <p className={`font-medium text-sm truncate ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>
                                  {resource.name}
                                </p>
                                <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                  {formatFileSize(resource.size)} • {new Date(resource.uploadedAt).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation()
                                downloadResource(resource.name)
                              }}
                              className={`h-8 w-8 flex-shrink-0 ${isDarkMode ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'}`}
                              title="Download PDF"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </div>
          )}

          {/* Assignment Submission Dialog */}
          {showSubmitDialog && selectedAssignment && (
            <Dialog open={showSubmitDialog} onOpenChange={(open) => {
              if (!open && !isSubmitting) {
                setShowSubmitDialog(false)
                setSelectedAssignment(null)
                setSubmissionFile(null)
                if (submissionFileInputRef.current) {
                  submissionFileInputRef.current.value = ""
                }
              }
            }}>
              <DialogContent className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
                <DialogHeader>
                  <DialogTitle className={isDarkMode ? 'text-gray-100' : ''}>Submit Assignment</DialogTitle>
                  <DialogDescription className={isDarkMode ? 'text-gray-400' : ''}>
                    Upload your completed assignment for {selectedAssignment.name}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Assignment Name
                    </label>
                    <Input
                      value={selectedAssignment.name}
                      readOnly
                      tabIndex={-1}
                      onFocus={(e) => e.target.blur()}
                      className={isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100 cursor-default' : 'cursor-default'}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Upload PDF *
                    </label>
                    <input
                      ref={submissionFileInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={(e) => setSubmissionFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => submissionFileInputRef.current?.click()}
                        className={isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100 hover:bg-gray-600' : ''}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {submissionFile ? submissionFile.name : "Choose PDF File"}
                      </Button>
                      {submissionFile && (
                        <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {formatFileSize(submissionFile.size)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end space-x-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowSubmitDialog(false)
                      setSelectedAssignment(null)
                      setSubmissionFile(null)
                      if (submissionFileInputRef.current) {
                        submissionFileInputRef.current.value = ""
                      }
                    }}
                    disabled={isSubmitting}
                    className={isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100 hover:bg-gray-600' : ''}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmitAssignment}
                    disabled={isSubmitting || !submissionFile}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Submitting...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Submit
                      </>
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* PDF Preview Dialog */}
          {showPreviewDialog && previewResourceIndex !== null && resources[previewResourceIndex] && (
            <Dialog open={showPreviewDialog} onOpenChange={(open) => {
              if (!open && !isDownloading) {
                // Clean up blob URL when closing dialog
                if (previewBlobUrl) {
                  URL.revokeObjectURL(previewBlobUrl)
                  setPreviewBlobUrl(null)
                }
                setShowPreviewDialog(false)
                setPreviewResourceIndex(null)
              }
            }}>
              <DialogContent className="max-w-6xl w-[95vw] max-h-[95vh] h-[95vh] flex flex-col p-0">
                <DialogHeader className="px-6 pt-4 pb-3 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <DialogTitle className="text-lg">Preview PDF - {resources[previewResourceIndex].name}</DialogTitle>
                    </div>
                  </div>
                </DialogHeader>
                
                <div className="flex-1 flex flex-col min-h-0 px-6 overflow-hidden">
                  {/* PDF Preview */}
                  <div className="flex-1 border rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900 min-h-0" style={{ height: 'calc(95vh - 200px)' }}>
                    {resources[previewResourceIndex] && previewBlobUrl && (
                      <iframe
                        src={previewBlobUrl}
                        className="w-full h-full"
                        title={`Preview of ${resources[previewResourceIndex].name}`}
                        style={{ border: 'none', minHeight: '600px' }}
                      />
                    )}
                    {resources[previewResourceIndex] && !previewBlobUrl && (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                          <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Loading preview...</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end mt-3 pt-3 pb-4 border-t flex-shrink-0">
                    <Button
                      onClick={() => downloadResource(resources[previewResourceIndex].name)}
                      disabled={isDownloading}
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                    >
                      {isDownloading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Downloading...
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
    </div>
  )
}
