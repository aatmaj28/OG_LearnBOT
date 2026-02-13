"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Clock, MessageSquare, TrendingUp, Eye } from "lucide-react"
import type { Class, User, ChatSession, ChatMessage } from "@/lib/types"
import { getConversationCardTitle } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface StudentActivityData {
  student: User
  totalChatTime: number
  totalSessions: number
  averageSentiment: number
  topTopics: { topic: string; count: number }[]
  sentimentWords: string[]
  lastActive: Date
  sessions: ChatSession[]
}

interface StudentMonitoringTabProps {
  isDarkMode?: boolean
}

export function StudentMonitoringTab({ isDarkMode = false }: StudentMonitoringTabProps) {
  const [classes, setClasses] = useState<Class[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string>("")
  const [studentActivities, setStudentActivities] = useState<StudentActivityData[]>([])
  const [selectedStudent, setSelectedStudent] = useState<User | null>(null)
  const [studentSessions, setStudentSessions] = useState<ChatSession[]>([])
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null)
  const [sessionMessages, setSessionMessages] = useState<ChatMessage[]>([])
  const [showChatDialog, setShowChatDialog] = useState(false)

  const loadClasses = async () => {
    const facultyId = localStorage.getItem("userId")
    if (!facultyId) return

    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      const data = await classesApi.getClasses(facultyId)
      setClasses(data.classes ?? [])
      if (data.classes?.length) {
        setSelectedClassId(data.classes[0].id)
      }
    } catch (error) {
      console.error("[v0] Failed to load classes:", error)
    }
  }

  const loadStudentActivities = useCallback(async () => {
    if (!selectedClassId) return

    try {
      // Use Flask API client which properly sends session headers
      const { analyticsApi } = await import("@/lib/flask-api-client")
      const data = await analyticsApi.getClassActivity(selectedClassId) as { activities: StudentActivityData[] }
      setStudentActivities(data.activities)
    } catch (error) {
      console.error("[v0] Failed to load student activities:", error)
    }
  }, [selectedClassId])


  useEffect(() => {
    loadClasses()
  }, [])

  useEffect(() => {
    if (selectedClassId) {
      loadStudentActivities()
    }
  }, [selectedClassId, loadStudentActivities])

  // Auto-refresh student activities (sentiment and topics) every 1 hour
  useEffect(() => {
    if (!selectedClassId) return

    // Set up interval to refresh student activities every 1 hour
    const refreshInterval = setInterval(() => {
      loadStudentActivities()
    }, 60 * 60 * 1000) // 1 hour = 3,600,000 ms

    // Cleanup interval on unmount or when class changes
    return () => clearInterval(refreshInterval)
  }, [selectedClassId, loadStudentActivities])

  const viewStudentChats = async (student: User) => {
    setSelectedStudent(student)
    setStudentSessions([]) // clear previous so we don't show stale list

    try {
      // Use Flask API (same source as analytics count) so chat history matches
      const { chatApi } = await import("@/lib/flask-api-client")
      const data = await chatApi.getConversations(student.id, selectedClassId || undefined) as { conversations?: any[] }
      const list = data.conversations ?? []
      const sessions = list.map((conv: any) => ({
        id: conv.id,
        userId: conv.userId,
        title: conv.title,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        status: conv.status,
        messageCount: conv.messageHistory?.length || 0,
        messageHistory: conv.messageHistory,
        titleSnippet: conv.titleSnippet
      }))
      setStudentSessions(sessions)
    } catch (error) {
      console.error("[v0] Failed to load student conversations:", error)
      setStudentSessions([])
    }
  }

  const viewSessionMessages = async (session: ChatSession) => {
    setSelectedSession(session)

    try {
      const { chatApi } = await import("@/lib/flask-api-client")
      const data = await chatApi.getConversation(session.id) as { conversation?: { messageHistory?: any[] } }
      const messages = (data.conversation?.messageHistory ?? []).map((msg: any) => ({
        id: `${session.id}-${msg.timestamp}`,
        sessionId: session.id,
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.timestamp),
        metadata: msg.metadata || {}
      }))
      setSessionMessages(messages)
      setShowChatDialog(true)
    } catch (error) {
      console.error("[v0] Failed to load conversation messages:", error)
    }
  }

  const getSentimentColor = (sentiment: number) => {
    if (sentiment > 0.3) return "text-green-600 dark:text-green-400"
    if (sentiment < -0.3) return "text-red-600 dark:text-red-400"
    return "text-yellow-600 dark:text-yellow-400"
  }

  const getSentimentLabel = (sentiment: number) => {
    if (sentiment > 0.3) return "Positive"
    if (sentiment < -0.3) return "Negative"
    return "Neutral"
  }

  return (
    <div className="h-full flex flex-col p-6">
      <div className="mb-6">
        <h2 className={`text-2xl font-bold mb-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Student Monitoring</h2>
        <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>View student activity and chat history</p>
      </div>

      {classes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <p className="text-muted-foreground mb-2">No classes found</p>
            <p className="text-sm text-muted-foreground">Create a class to monitor students</p>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger className={`w-[300px] ${isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : ''}`}>
                <SelectValue placeholder="Select a class" />
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

          <div className="flex-1 flex gap-6 overflow-hidden">
            {/* Student List */}
            <div className="w-96">
              <ScrollArea className="h-full">
                <div className="space-y-3">
                  {studentActivities.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No student activity data available</p>
                  ) : (
                    studentActivities.map((activity) => (
                      <Card
                        key={activity.student.id}
                        className={`cursor-pointer hover:bg-accent transition-colors ${selectedStudent?.id === activity.student.id ? "bg-accent" : ""
                          }`}
                        onClick={() => viewStudentChats(activity.student)}
                      >
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">{activity.student.name}</CardTitle>
                          <CardDescription className="text-xs">{activity.student.email}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              <span>{activity.totalChatTime} min</span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <MessageSquare className="h-4 w-4" />
                              <span>{activity.totalSessions} chats</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="h-4 w-4 text-muted-foreground" />
                              <span className={getSentimentColor(activity.averageSentiment)}>
                                {getSentimentLabel(activity.averageSentiment)}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(activity.lastActive).toLocaleDateString()}
                            </span>
                          </div>
                          {activity.sentimentWords && activity.sentimentWords.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {activity.sentimentWords.map((word, index) => (
                                <Badge
                                  key={index}
                                  variant="outline"
                                  className={`text-xs ${activity.averageSentiment > 0.3
                                    ? 'border-green-500 text-green-700 dark:text-green-400'
                                    : activity.averageSentiment < -0.3
                                      ? 'border-red-500 text-red-700 dark:text-red-400'
                                      : 'border-yellow-500 text-yellow-700 dark:text-yellow-400'
                                    }`}
                                >
                                  {word}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {activity.topTopics.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {activity.topTopics.slice(0, 3).map((topic) => (
                                <Badge key={topic.topic} variant="secondary" className="text-xs">
                                  {topic.topic}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Student Chat History */}
            <div className="flex-1">
              {!selectedStudent ? (
                <div className="h-full flex items-start justify-center pt-16">
                  <div className="text-center max-w-md">
                    <div className={`p-4 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center ${isDarkMode ? 'bg-indigo-900' : 'bg-indigo-100'}`}>
                      <Eye className={`h-10 w-10 ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
                    </div>
                    <h3 className={`text-xl font-bold mb-3 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Select a Student</h3>
                    <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Choose a student to view their chat history and activity</p>
                  </div>
                </div>
              ) : (
                <Card className="h-full flex flex-col">
                  <CardHeader>
                    <CardTitle>{selectedStudent.name}'s Chat History</CardTitle>
                    <CardDescription>View all conversations and interactions</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-hidden">
                    <ScrollArea className="h-full">
                      <div className="space-y-2">
                        {studentSessions.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-8">No chat history available</p>
                        ) : (
                          studentSessions.map((session) => (
                            <Card
                              key={session.id}
                              className="p-4 cursor-pointer hover:bg-accent transition-colors"
                              onClick={() => viewSessionMessages(session)}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <p className="font-medium text-sm truncate flex-1 min-w-0 pr-2">{getConversationCardTitle(session)}</p>
                                <Button variant="ghost" size="sm">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <MessageSquare className="h-3 w-3" />
                                  <span>{session.messageCount} messages</span>
                                </div>
                                <span>{new Date(session.updatedAt).toLocaleDateString()}</span>
                              </div>
                            </Card>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      {/* Chat Messages Dialog */}
      <Dialog open={showChatDialog} onOpenChange={setShowChatDialog}>
        <DialogContent
          className="!max-w-6xl max-h-[90vh] w-[90vw] sm:!max-w-6xl"
          style={{ maxWidth: '90vw', width: '90vw', maxHeight: '90vh' }}
        >
          <DialogHeader>
            <DialogTitle>{selectedSession ? getConversationCardTitle(selectedSession) : "Chat"}</DialogTitle>
            <DialogDescription>
              {selectedStudent?.name} • {new Date(selectedSession?.updatedAt || "").toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[70vh] pr-4">
            <div className="space-y-4">
              {sessionMessages.map((message) => (
                <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-lg p-4 ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                      }`}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                    <p className="text-xs opacity-70 mt-2">{new Date(message.timestamp).toLocaleTimeString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
