"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LogoutButton } from "@/components/logout-button"
import { MessageSquare, Send, Plus, History, Bot, Wifi, WifiOff, BookOpen, Trash2, Search, LayoutGrid, ArrowUp, Mic } from "lucide-react"
import Image from "next/image"
import type { RAGConversation, Class } from "@/lib/types"

const SUGGESTED_PROMPTS = [
  { title: "Explain a concept", description: "help me understand it better" },
  { title: "Show me examples", description: "of how to solve this problem" },
  { title: "Practice quiz", description: "give me questions on this topic" },
  { title: "Study guide", description: "create a summary for this chapter" }
]

export function StudentChatInterface() {
  const [conversations, setConversations] = useState<RAGConversation[]>([])
  const [currentConversation, setCurrentConversation] = useState<RAGConversation | null>(null)
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [userName, setUserName] = useState("")
  const [selectedClassId, setSelectedClassId] = useState<string>("")
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
        setShowHistory(false)
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

    // Add user message to conversation immediately for instant display
    const userMessageObj = {
      role: "user" as const,
      content: userMessage,
      timestamp: new Date(),
      metadata: {}
    }
    
    // Update current conversation state immediately
    setCurrentConversation(prev => prev ? {
      ...prev,
      messageHistory: [...(prev?.messageHistory || []), userMessageObj]
    } : null)

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
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)
      console.log("[v0] Fetch request completed, status:", response.status)

      if (response.ok) {
        const responseData = await response.json()
        console.log("[v0] AI response received:", responseData)
        
        // Reload the conversation to get the complete updated messages from database
        console.log("[v0] Reloading conversation:", currentConversation.id)
        await loadConversation(currentConversation.id)
        await loadConversations()
        console.log("[v0] Conversation reloaded successfully")
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

  const handleSuggestedPrompt = async (prompt: { title: string, description: string }) => {
    // Create conversation if none exists
    if (!currentConversation) {
      await createNewConversation()
    }
    // Wait for conversation to be created
    await new Promise(resolve => setTimeout(resolve, 100))
    // Set the input with the suggested text
    setInput(`${prompt.title}: ${prompt.description}`)
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
            {/* Class Selection */}
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select class..." />
                </SelectTrigger>
                <SelectContent>
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
                  <span className="text-xs font-medium">RAG Ready</span>
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
            <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)}>
              <History className="h-4 w-4 mr-2" />
              History
            </Button>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden bg-[#1a1a1a]">
        {/* Dark Left Sidebar */}
        <div className="w-16 bg-[#0f0f0f] flex flex-col items-center py-4 gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-12 h-12 rounded-full hover:bg-[#2a2a2a] text-white"
            onClick={createNewConversation}
            title="New Chat"
          >
            <Plus className="h-5 w-5" />
          </Button>
          <Button variant="ghost" 
            size="sm" 
            className="w-12 h-12 rounded-full hover:bg-[#2a2a2a] text-white"
            onClick={() => setShowHistory(!showHistory)}
            title={showHistory ? "Hide History" : "Show History"}
          >
            <LayoutGrid className="h-5 w-5" />
          </Button>
          <div className="w-8 h-px bg-[#2a2a2a]"></div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-12 h-12 rounded-full hover:bg-[#2a2a2a] text-white"
            title="Search"
          >
            <Search className="h-5 w-5" />
          </Button>
        </div>

        {/* Chat History Sidebar */}
        {showHistory && (
          <div className="w-80 bg-[#141414] border-r border-[#2a2a2a]">
            <div className="p-4 border-b border-[#2a2a2a]">
              <h2 className="font-semibold text-white">Chat History</h2>
            </div>
            <ScrollArea className="h-[calc(100vh-180px)]">
              <div className="space-y-2">
                {!selectedClassId ? (
                  <div className="text-center py-8 px-4">
                    <BookOpen className="mx-auto h-12 w-12 text-gray-500 mb-4" />
                    <p className="text-sm text-gray-400 mb-2">Select a class to view conversations</p>
                  </div>
                ) : !conversations || conversations.length === 0 ? (
                  <div className="text-center py-8 px-4">
                    <MessageSquare className="mx-auto h-12 w-12 text-gray-500 mb-4" />
                    <p className="text-sm text-gray-400 mb-2">No conversations yet</p>
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
        )}

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#1a1a1a]">
        {!currentConversation ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center w-full">
              {/* Logo - Large centered icon */}
              <div className="mb-8">
                <div className="mx-auto w-16 h-16 rounded-full bg-[#2a2a2a] flex items-center justify-center mb-4">
                  <Bot className="h-10 w-10 text-white" />
                </div>
                <h1 className="text-4xl font-bold text-white mb-2">
                  {selectedClassId ? `${classes.find(c => c.id === selectedClassId)?.name || 'LearnBot'}` : 'LearnBot'}
                </h1>
                <p className="text-xl text-gray-400">How can I help you today?</p>
              </div>

              {/* Suggested Prompts */}
              <div className="max-w-5xl mx-auto mt-12">
                <h3 className="text-sm font-medium text-gray-400 mb-4 text-left">+ Suggested</h3>
                <div className="grid grid-cols-2 gap-3">
                  {SUGGESTED_PROMPTS.map((prompt, index) => (
                    <button
                      key={index}
                      onClick={() => handleSuggestedPrompt(prompt)}
                      disabled={!selectedClassId}
                      className="bg-[#202020] hover:bg-[#2a2a2a] border border-[#2a2a2a] rounded-lg p-4 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                      <p className="text-white font-medium mb-1">{prompt.title}</p>
                      <p className="text-sm text-gray-400 mb-2">{prompt.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Prompt</span>
                        <ArrowUp className="h-4 w-4 text-gray-500 group-hover:text-white transition-colors" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
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
                          <p className="text-xs opacity-70 mt-2">{new Date(message.timestamp).toLocaleTimeString()}</p>
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
              <div className="border-t border-[#2a2a2a] bg-[#0f0f0f] p-4">
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center gap-2 bg-[#1a1a1a] rounded-lg px-4 py-3 border border-[#2a2a2a]">
                    <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                      <Plus className="h-4 w-4" />
                    </Button>
                    <input
                      placeholder="Send a message..."
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyPress={handleKeyPress}
                      disabled={loading}
                      className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none"
                    />
                    <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                      <Mic className="h-4 w-4" />
                    </Button>
                    <Button 
                      onClick={sendMessage} 
                      disabled={loading || !input.trim()}
                      className="text-white bg-transparent hover:bg-[#2a2a2a]"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    AI assistants can make mistakes. Verify important information.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
