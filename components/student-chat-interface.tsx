"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LogoutButton } from "@/components/logout-button"
import { MessageSquare, Send, Plus, Bot, Wifi, WifiOff, BookOpen, Trash2, Zap } from "lucide-react"
import type { RAGConversation, Class, ModelBackend } from "@/lib/types"

export function StudentChatInterface() {
  const [conversations, setConversations] = useState<RAGConversation[]>([])
  const [currentConversation, setCurrentConversation] = useState<RAGConversation | null>(null)
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [userName, setUserName] = useState("")
  const [selectedClassId, setSelectedClassId] = useState<string>("")
  const [preferredModel, setPreferredModel] = useState<ModelBackend>("remote-blackwell")
  const [classes, setClasses] = useState<Class[]>([])
  const [ragStatus, setRagStatus] = useState<{
    isAvailable: boolean
    ollamaAvailable: boolean
  }>({ isAvailable: false, ollamaAvailable: false })
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadUserData()
    loadClasses()
    loadConversations()
    checkRAGStatus()
    
    // Poll status every 5 seconds to detect when RAG becomes ready
    const statusInterval = setInterval(checkRAGStatus, 5000)
    
    return () => clearInterval(statusInterval)
  }, [])

  useEffect(() => {
    if (selectedClassId) {
      loadConversations()
    }
  }, [selectedClassId])

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

  useEffect(() => {
    if (scrollRef.current && currentConversation) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [currentConversation])

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

      const url = `/api/chat/conversations?userId=${userId}&classId=${selectedClassId}`
      
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
        body: JSON.stringify({ userId, classId: selectedClassId }),
      })

      if (response.ok) {
        const data = await response.json()
        setCurrentConversation(data.conversation)
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

    // Track time to first token (TTFT)
    const sendTimestamp = Date.now()
    let firstTokenTimestamp: number | null = null

    // Add user message to conversation immediately for instant display
    const userMessageObj = {
      role: "user",
      content: userMessage,
      timestamp: new Date(),
      metadata: {}
    }
    
    // Update current conversation state immediately
    setCurrentConversation(prev => ({
      ...prev,
      messageHistory: [...(prev?.messageHistory || []), userMessageObj]
    }))

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
            role: "assistant",
            content: "",
            timestamp: new Date(),
            metadata: { timeToFirstToken: null }
          }
          
          // Add empty assistant message that we'll update
          setCurrentConversation(prev => ({
            ...prev,
            messageHistory: [...(prev?.messageHistory || []), assistantMessageObj]
          }))
          
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
                        const messages = [...(prev?.messageHistory || [])]
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
            if (!prev?.messageHistory) return prev
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
      if (error.name === 'AbortError') {
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

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="font-semibold">Student Portal</h1>
              <p className="text-sm text-muted-foreground">Welcome, {userName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Model Selection */}
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <Select value={preferredModel} onValueChange={(value) => setPreferredModel(value as ModelBackend)}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Select model..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">
                    <div className="flex items-center gap-2">
                      <span>⚡ OpenAI GPT-3.5</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="remote-a6000">
                    <div className="flex items-center gap-2">
                      <span>🚀 Remote A6000 (Gemma 27B)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="remote-blackwell">
                    <div className="flex items-center gap-2">
                      <span>⚡ Remote Blackwell (Gemma 27B)</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Class Selection */}
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select class..." />
                </SelectTrigger>
                <SelectContent>
                  {/* Entire Corpus Option */}
                  <SelectItem value="entire-corpus">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-blue-600">📚 Entire Corpus</span>
                    </div>
                  </SelectItem>
                  {classes.length > 0 && (
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      Individual Classes
                    </div>
                  )}
                  {classes.map((classItem) => (
                    <SelectItem key={classItem.id} value={classItem.id}>
                      {classItem.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* AI Status Indicator */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted">
              <Bot className="h-4 w-4" />
              {ragStatus.isAvailable ? (
                <div className="flex items-center gap-1 text-green-600">
                  <Wifi className="h-3 w-3" />
                  <span className="text-xs font-medium">RAG</span>
                </div>
              ) : ragStatus.ollamaAvailable ? (
                <div className="flex items-center gap-1 text-blue-600">
                  <Wifi className="h-3 w-3" />
                  <span className="text-xs font-medium">Ollama Ready</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-orange-600">
                  <WifiOff className="h-3 w-3" />
                  <span className="text-xs font-medium">Fallback</span>
                </div>
              )}
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Chat History Sidebar - Always Visible */}
        <div className="w-80 border-r bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Chat History</h2>
              <Button size="sm" onClick={createNewConversation}>
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
            </div>
            <ScrollArea className="h-[calc(100vh-180px)]">
              <div className="space-y-2">
                {!selectedClassId ? (
                  <div className="text-center py-8">
                    <BookOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground mb-2">Select a class to view conversations</p>
                    <p className="text-xs text-muted-foreground">Choose a class from the dropdown above to see your chat history</p>
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
                            <p className="text-xs text-blue-600 mt-1">Topic: {conversation.currentTopic}</p>
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
        <div className="flex-1 flex flex-col overflow-hidden">
        {!currentConversation ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <div className="p-4 bg-blue-100 dark:bg-blue-900 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                <MessageSquare className="h-10 w-10 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-2xl font-bold mb-3">Start a New Conversation</h2>
              <p className="text-muted-foreground mb-6">
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
                            message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
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
                              {message.metadata.modelUsed === 'openai' ? '⚡ OpenAI' : 
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
              <div className="border-t bg-card p-4">
                <div className="max-w-3xl mx-auto flex gap-2">
                  <Input
                    placeholder="Type your message..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={loading}
                    className="flex-1"
                  />
                  <Button onClick={sendMessage} disabled={loading || !input.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
