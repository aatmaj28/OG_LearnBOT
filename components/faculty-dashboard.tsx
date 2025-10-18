"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LogoutButton } from "@/components/logout-button"
import { MessageSquare, Users, BarChart3, BookOpen } from "lucide-react"
import { FacultyChatTab } from "@/components/faculty-chat-tab"
import { ClassManagementTab } from "@/components/class-management-tab"
import { StudentMonitoringTab } from "@/components/student-monitoring-tab"
import { AnalyticsTab } from "@/components/analytics-tab"

export function FacultyDashboard() {
  const [userName, setUserName] = useState("")

  useEffect(() => {
    loadUserData()
  }, [])

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

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900 rounded-lg">
              <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="font-semibold">Faculty Portal</h1>
              <p className="text-sm text-muted-foreground">Welcome, {userName}</p>
            </div>
          </div>
          <LogoutButton />
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="chat" className="h-full flex flex-col">
          <div className="border-b bg-card px-4">
            <TabsList className="h-12">
              <TabsTrigger value="chat" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                Chat
              </TabsTrigger>
              <TabsTrigger value="classes" className="gap-2">
                <BookOpen className="h-4 w-4" />
                Classes
              </TabsTrigger>
              <TabsTrigger value="students" className="gap-2">
                <Users className="h-4 w-4" />
                Students
              </TabsTrigger>
              <TabsTrigger value="analytics" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Analytics
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden">
            <TabsContent value="chat" className="h-full m-0">
              <FacultyChatTab />
            </TabsContent>
            <TabsContent value="classes" className="h-full m-0">
              <ClassManagementTab />
            </TabsContent>
            <TabsContent value="students" className="h-full m-0">
              <StudentMonitoringTab />
            </TabsContent>
            <TabsContent value="analytics" className="h-full m-0">
              <AnalyticsTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}
