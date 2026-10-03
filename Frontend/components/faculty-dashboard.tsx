"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { LogoutButton } from "@/components/logout-button"
import { MessageSquare, Users, BarChart3, BookOpen, Database, Sun, Moon } from "lucide-react"
import { FacultyChatTab } from "@/components/faculty-chat-tab"
import { ClassManagementTab } from "@/components/class-management-tab"
import { StudentMonitoringTab } from "@/components/student-monitoring-tab"
import { AnalyticsTab } from "@/components/analytics-tab"
import { CorpusManagementTab } from "@/components/corpus-management-tab"

export function FacultyDashboard() {
  const [userName, setUserName] = useState("")
  const [activeTab, setActiveTab] = useState("chat")
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    loadUserData()

    // Load dark mode state from localStorage
    const savedDarkMode = localStorage.getItem("facultyDarkMode")
    if (savedDarkMode !== null) {
      setIsDarkMode(savedDarkMode === "true")
    }
  }, [])

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

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    localStorage.setItem("facultyActiveTab", value)
  }

  const toggleDarkMode = () => {
    const newState = !isDarkMode
    setIsDarkMode(newState)
    localStorage.setItem("facultyDarkMode", String(newState))
  }

  return (
    <div className={`h-screen flex flex-col ${isDarkMode ? 'dark bg-gradient-to-br from-gray-900 to-blue-950' : 'bg-gradient-to-br from-gray-50 to-blue-50/20'}`}>
      {/* Header */}
      <header className={`border-b shadow-sm ${isDarkMode ? 'bg-gray-800/90 border-gray-700' : 'bg-white/80'} backdrop-blur-sm`}>
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-md">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className={`font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Faculty Portal</h1>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Welcome, {userName}</p>
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

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="h-full flex flex-col">
          <div className={`border-b px-4 shadow-sm ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
            <TabsList className="h-12 bg-transparent">
              <TabsTrigger value="chat" className={`gap-2 ${isDarkMode ? 'data-[state=active]:bg-blue-900/50 data-[state=active]:text-blue-300' : 'data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700'}`}>
                <MessageSquare className="h-4 w-4" />
                Chat
              </TabsTrigger>
              <TabsTrigger value="classes" className={`gap-2 ${isDarkMode ? 'data-[state=active]:bg-blue-900/50 data-[state=active]:text-blue-300' : 'data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700'}`}>
                <BookOpen className="h-4 w-4" />
                Classes
              </TabsTrigger>
              <TabsTrigger value="corpus" className={`gap-2 ${isDarkMode ? 'data-[state=active]:bg-blue-900/50 data-[state=active]:text-blue-300' : 'data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700'}`}>
                <Database className="h-4 w-4" />
                Corpus
              </TabsTrigger>
              <TabsTrigger value="students" className={`gap-2 ${isDarkMode ? 'data-[state=active]:bg-blue-900/50 data-[state=active]:text-blue-300' : 'data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700'}`}>
                <Users className="h-4 w-4" />
                Students
              </TabsTrigger>
              <TabsTrigger value="analytics" className={`gap-2 ${isDarkMode ? 'data-[state=active]:bg-blue-900/50 data-[state=active]:text-blue-300' : 'data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700'}`}>
                <BarChart3 className="h-4 w-4" />
                Analytics
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="chat" className="h-full m-0">
              <FacultyChatTab isDarkMode={isDarkMode} />
            </TabsContent>
            <TabsContent value="classes" className="h-full m-0">
              <ClassManagementTab isDarkMode={isDarkMode} />
            </TabsContent>
            <TabsContent value="corpus" className="h-full m-0">
              <CorpusManagementTab isDarkMode={isDarkMode} />
            </TabsContent>
            <TabsContent value="students" className="h-full m-0">
              <StudentMonitoringTab isDarkMode={isDarkMode} />
            </TabsContent>
            <TabsContent value="analytics" className="h-full m-0">
              <AnalyticsTab isDarkMode={isDarkMode} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}
