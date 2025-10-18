"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { LogoutButton } from "@/components/logout-button"
import { MessageSquare, Send, Plus, History, Bot, Wifi, WifiOff } from "lucide-react"
import type { ChatSession, ChatMessage } from "@/lib/types"

export function StudentChatInterface() {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [userName, setUserName] = useState("")
  const [ollamaStatus, setOllamaStatus] = useState<{
    isRunning: boolean
    modelAvailable: boolean
  }>({ isRunning: false, modelAvailable: false })
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadUserData()
    loadSessions()
    checkOllamaStatus()
  }, [])

  const checkOllamaStatus = async () => {
    try {
      const response = await fetch('/api/ollama/status')
      if (response.ok) {
        const data = await response.json()
        setOllamaStatus({
          isRunning: data.isRunning,
          modelAvailable: data.modelAvailable
        })
      }
    } catch (error) {
      console.error('Failed to check Ollama status:', error)
    }
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

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

  const loadSessions = async () => {
    const userId = localStorage.getItem("userId")
    if (!userId) return

    try {
      const response = await fetch(`/api/chat/sessions?userId=${userId}`)
      if (response.ok) {
        const data = await response.json()
        setSessions(data.sessions)
      }
    } catch (error) {
      console.error("[v0] Failed to load sessions:", error)
    }
  }

  const loadSession = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/chat/messages?sessionId=${sessionId}`)
      if (response.ok) {
        const data = await response.json()
        setMessages(data.messages)
        const session = sessions.find((s) => s.id === sessionId)
        if (session) {
          setCurrentSession(session)
        }
        setShowHistory(false)
      }
    } catch (error) {
      console.error("[v0] Failed to load session:", error)
    }
  }

  const createNewSession = async () => {
    const userId = localStorage.getItem("userId")
    if (!userId) return

    try {
      const response = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })

      if (response.ok) {
        const data = await response.json()
        setCurrentSession(data.session)
        setMessages([])
        await loadSessions()
        setShowHistory(false)
      }
    } catch (error) {
      console.error("[v0] Failed to create session:", error)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userId = localStorage.getItem("userId")
    if (!userId) return

    // Create session if none exists
    if (!currentSession) {
      await createNewSession()
      return
    }

    const userMessage = input.trim()
    setInput("")
    setLoading(true)

    try {
      // First, send the user message and get updated messages
      const sendResponse = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          sessionId: currentSession.id,
          message: userMessage,
        }),
      })

      if (sendResponse.ok) {
        const sendData = await sendResponse.json()
        setMessages(sendData.messages)
        await loadSessions()

        // Now get the AI response
        const aiResponse = await fetch("/api/chat/ai-response", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userMessage,
            userId,
            sessionId: currentSession.id,
          }),
        })

        if (aiResponse.ok) {
          // Reload messages to get the AI response from database
          const messagesResponse = await fetch(`/api/chat/messages?sessionId=${currentSession.id}`)
          if (messagesResponse.ok) {
            const messagesData = await messagesResponse.json()
            setMessages(messagesData.messages)
          }
        }
      }
    } catch (error) {
      console.error("[v0] Failed to send message:", error)
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
            {/* Ollama Status Indicator */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted">
              <Bot className="h-4 w-4" />
              {ollamaStatus.isRunning && ollamaStatus.modelAvailable ? (
                <div className="flex items-center gap-1 text-green-600">
                  <Wifi className="h-3 w-3" />
                  <span className="text-xs font-medium">AI Ready</span>
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

      <div className="flex-1 flex overflow-hidden">
        {/* Chat History Sidebar */}
        {showHistory && (
          <div className="w-80 border-r bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Chat History</h2>
              <Button size="sm" onClick={createNewSession}>
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
            </div>
            <ScrollArea className="h-[calc(100vh-180px)]">
              <div className="space-y-2">
                {sessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No chat history yet</p>
                ) : (
                  sessions.map((session) => (
                    <Card
                      key={session.id}
                      className={`p-3 cursor-pointer hover:bg-accent transition-colors ${
                        currentSession?.id === session.id ? "bg-accent" : ""
                      }`}
                      onClick={() => loadSession(session.id)}
                    >
                      <p className="font-medium text-sm truncate">{session.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(session.updatedAt).toLocaleDateString()} • {session.messageCount} messages
                      </p>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!currentSession ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="p-4 bg-blue-100 dark:bg-blue-900 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                  <MessageSquare className="h-10 w-10 text-blue-600 dark:text-blue-400" />
                </div>
                <h2 className="text-2xl font-bold mb-3">Start a New Conversation</h2>
                <p className="text-muted-foreground mb-6">
                  Ask me anything about your studies. I'm here to help you learn!
                </p>
                <Button size="lg" onClick={createNewSession}>
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
                  {messages.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground">Start the conversation by sending a message below</p>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
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
