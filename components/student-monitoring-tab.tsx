"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Clock, MessageSquare, TrendingUp, Eye } from "lucide-react"
import type { Class, User, ChatSession, ChatMessage } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface StudentActivityData {
  student: User
  totalChatTime: number
  totalSessions: number
  averageSentiment: number
  topTopics: { topic: string; count: number }[]
  lastActive: Date
  sessions: ChatSession[]
}

export function StudentMonitoringTab() {
  const [classes, setClasses] = useState<Class[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string>("")
  const [studentActivities, setStudentActivities] = useState<StudentActivityData[]>([])
  const [selectedStudent, setSelectedStudent] = useState<User | null>(null)
  const [studentSessions, setStudentSessions] = useState<ChatSession[]>([])
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null)
  const [sessionMessages, setSessionMessages] = useState<ChatMessage[]>([])
  const [showChatDialog, setShowChatDialog] = useState(false)

  useEffect(() => {
    loadClasses()
  }, [])

  useEffect(() => {
    if (selectedClassId) {
      loadStudentActivities()
    }
  }, [selectedClassId])

  const loadClasses = async () => {
    const facultyId = localStorage.getItem("userId")
    if (!facultyId) return

    try {
      const response = await fetch(`/api/classes?facultyId=${facultyId}`)
      if (response.ok) {
        const data = await response.json()
        setClasses(data.classes)
        if (data.classes.length > 0) {
          setSelectedClassId(data.classes[0].id)
        }
      }
    } catch (error) {
      console.error("[v0] Failed to load classes:", error)
    }
  }

  const loadStudentActivities = async () => {
    if (!selectedClassId) return

    try {
      const response = await fetch(`/api/analytics/class-activity?classId=${selectedClassId}`)
      if (response.ok) {
        const data = await response.json()
        setStudentActivities(data.activities)
      }
    } catch (error) {
      console.error("[v0] Failed to load student activities:", error)
    }
  }

  const viewStudentChats = async (student: User) => {
    setSelectedStudent(student)

    try {
      const response = await fetch(`/api/chat/sessions?userId=${student.id}`)
      if (response.ok) {
        const data = await response.json()
        setStudentSessions(data.sessions)
      }
    } catch (error) {
      console.error("[v0] Failed to load student sessions:", error)
    }
  }

  const viewSessionMessages = async (session: ChatSession) => {
    setSelectedSession(session)

    try {
      const response = await fetch(`/api/chat/messages?sessionId=${session.id}`)
      if (response.ok) {
        const data = await response.json()
        setSessionMessages(data.messages)
        setShowChatDialog(true)
      }
    } catch (error) {
      console.error("[v0] Failed to load session messages:", error)
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
        <h2 className="text-2xl font-bold mb-2">Student Monitoring</h2>
        <p className="text-muted-foreground">View student activity and chat history</p>
      </div>

      {classes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <p className="text-muted-foreground">No classes found. Create a class to monitor students.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Select a class" />
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
                        className={`cursor-pointer hover:bg-accent transition-colors ${
                          selectedStudent?.id === activity.student.id ? "bg-accent" : ""
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
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-md">
                    <div className="p-4 bg-indigo-100 dark:bg-indigo-900 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                      <Eye className="h-10 w-10 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <h3 className="text-xl font-bold mb-3">Select a Student</h3>
                    <p className="text-muted-foreground">Choose a student to view their chat history and activity</p>
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
                                <p className="font-medium text-sm">{session.title}</p>
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
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{selectedSession?.title}</DialogTitle>
            <DialogDescription>
              {selectedStudent?.name} • {new Date(selectedSession?.updatedAt || "").toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-4">
              {sessionMessages.map((message) => (
                <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-lg p-4 ${
                      message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
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
