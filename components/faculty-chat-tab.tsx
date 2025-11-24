"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MessageSquare, Send, Plus, Bot, Wifi, WifiOff, BookOpen, Trash2, Zap, Calendar, Download } from "lucide-react"
import { ChatMessage } from "@/components/chat-message"
import type { RAGConversation, Class, ModelBackend } from "@/lib/types"

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
  const [preferredModel, setPreferredModel] = useState<ModelBackend>("claude")
  const [classes, setClasses] = useState<Class[]>([])
  const [ragStatus, setRagStatus] = useState<{
    isAvailable: boolean
    ollamaAvailable: boolean
  }>({ isAvailable: false, ollamaAvailable: false })
  const [userName, setUserName] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true) // Track if we should auto-scroll
  const isScrollingProgrammaticallyRef = useRef(false) // Track if we're programmatically scrolling

  useEffect(() => {
    loadUserData()
    loadClasses()
    loadConversations()
    checkRAGStatus()
    
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
            console.log(`[Faculty Chat] Preload result: ${result.loaded}/${result.total} stores loaded`)
          } else if (response.status === 503) {
            // RAG not ready yet, retry after a delay
            setTimeout(preloadUserClasses, 3000)
          } else {
            console.warn('[Faculty Chat] Preload failed:', await response.text())
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
    if (selectedClassId) {
      loadConversations()
    }
  }, [selectedClassId])

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

  const loadClasses = async () => {
    const userId = localStorage.getItem("userId")
    if (!userId) return

    try {
      const response = await fetch(`/api/classes?facultyId=${userId}`)
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
      console.log("[v0] Loading conversation:", conversationId)
      const response = await fetch(`/api/chat/conversations/${conversationId}`)
      if (response.ok) {
        const data = await response.json()
        console.log("[v0] Loaded conversation data:", data)
        console.log("[v0] Conversation messageHistory:", data.conversation?.messageHistory)
        console.log("[v0] MessageHistory length:", data.conversation?.messageHistory?.length)
        setCurrentConversation(data.conversation)
        // Reset auto-scroll when loading a conversation
        shouldAutoScrollRef.current = true
        console.log("[v0] Current conversation set:", data.conversation?.id)
      } else {
        console.error("[v0] Failed to load conversation:", response.status, response.statusText)
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
        console.log("[v0] Created conversation response:", data)
        setCurrentConversation(data.conversation)
        // Reset auto-scroll when creating a new conversation
        shouldAutoScrollRef.current = true
        await loadConversations()
      } else {
        console.error("[v0] Failed to create conversation:", response.status, response.statusText)
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

    if (!currentConversation) {
      console.log("[v0] No current conversation, creating new one")
      await createNewConversation()
      return
    }

    console.log("[v0] Sending message with conversation ID:", currentConversation.id)
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
      console.log("[v0] Starting fetch request to /api/chat/ai-response")
      console.log("[v0] Request body:", { message: userMessage, userId, sessionId: currentConversation.id })
      
      // Send message and get AI response with timeout
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
          stream: true, // ✅ Enable streaming
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
          let accumulatedResponse = '' // Declare outside the if block so it's accessible later
          
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
                      console.log("[v0] Streaming completed, modelUsed:", data.modelUsed)
                      // Capture modelUsed from the done event
                      if (data.modelUsed) {
                        setCurrentConversation(prev => {
                          if (!prev) return prev
                          const messages = [...(prev.messageHistory || [])]
                          if (messages.length > 0) {
                            const lastMsg = messages[messages.length - 1]
                            if (lastMsg.role === 'assistant') {
                              messages[messages.length - 1] = {
                                ...lastMsg,
                                metadata: {
                                  ...lastMsg.metadata,
                                  modelUsed: data.modelUsed
                                }
                              }
                            }
                          }
                          return { ...prev, messageHistory: messages }
                        })
                      }
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
          
          // Preserve the streamed content (including checkpoint update) before reloading
          const streamedContent = accumulatedResponse
          
          // Reload conversation to get the saved version from DB
          console.log("[v0] Reloading conversation:", currentConversation.id)
          await loadConversation(currentConversation.id)
          await loadConversations()
          console.log("[v0] Conversation reloaded successfully")
          
          // Merge frontend timing metrics with DB data and preserve streamed content (including checkpoint update)
          // Also preserve modelUsed if it was captured from the done event
          let capturedModelUsed: string | undefined = undefined
          setCurrentConversation(prev => {
            if (!prev?.messageHistory) return prev
            const messages = [...prev.messageHistory]
            if (messages.length > 0) {
              const lastMsg = messages[messages.length - 1]
              if (lastMsg.role === 'assistant') {
                // Preserve modelUsed if it was set during streaming
                capturedModelUsed = lastMsg.metadata?.modelUsed
                // Preserve the streamed content which includes the checkpoint update
                messages[messages.length - 1] = {
                  ...lastMsg,
                  content: streamedContent, // Use streamed content which includes checkpoint update
                  metadata: {
                    ...lastMsg.metadata,
                    timeToFirstToken: ttft,
                    totalResponseTime: totalResponseTime,
                    modelUsed: capturedModelUsed || lastMsg.metadata?.modelUsed // Preserve modelUsed
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* Chat History Sidebar */}
      <div className="w-80 border-r bg-card p-4">
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
                <SelectItem value="claude" className={isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100' : ''}>🧠 Claude 4.5 Haiku</SelectItem>
                <SelectItem value="remote-a6000" className={isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100' : ''}>🚀 Remote A6000 (Gemma 27B)</SelectItem>
                <SelectItem value="remote-blackwell" className={isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100' : ''}>⚡ Remote Blackwell (Gemma 27B)</SelectItem>
              </SelectContent>
            </Select>
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
              {/* AI Status Indicator */}
              <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                <Bot className="h-3 w-3" />
                {ragStatus.isAvailable ? (
                  <div className="flex items-center gap-1 text-green-600">
                    <Wifi className="h-2 w-2" />
                    <span className="text-xs">RAG</span>
                  </div>
                ) : ragStatus.ollamaAvailable ? (
                  <div className="flex items-center gap-1 text-blue-600">
                    <Wifi className="h-2 w-2" />
                    <span className="text-xs">Ollama</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-orange-600">
                    <WifiOff className="h-2 w-2" />
                    <span className="text-xs">Fallback</span>
                  </div>
                )}
              </div>
            </div>
            <Button size="sm" onClick={createNewConversation} disabled={!selectedClassId}>
              <Plus className="h-4 w-4 mr-1" />
              New
            </Button>
          </div>
        </div>
        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="space-y-2">
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
                  className={`p-3 cursor-pointer hover:bg-accent transition-colors group ${
                    currentConversation?.id === conversation.id ? "bg-accent" : ""
                  }`}
                  onClick={() => loadConversation(conversation.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{conversation.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(conversation.updatedAt).toLocaleDateString()} • {conversation.messageHistory.length} messages
                      </p>
                      {conversation.currentTopic && (
                        <p className="text-xs text-indigo-600 mt-1">Topic: {conversation.currentTopic}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 text-red-600 hover:text-red-700"
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

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
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
              <p className={`mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                {selectedClassId 
                  ? `Use the AI assistant to help with ${classes.find(c => c.id === selectedClassId)?.name || 'this class'}`
                  : "Select a class to start chatting with the AI assistant"
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
      </div>
    </div>
  )
}
