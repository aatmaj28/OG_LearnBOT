"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { LogoutButton } from "@/components/logout-button"
import { MessageSquare, BookOpen, Sun, Moon, Bot } from "lucide-react"
import { StudentChatInterface } from "@/components/student-chat-interface"
import { StudentClassesTab } from "@/components/student-classes-tab"

export function StudentDashboard() {
  const [userName, setUserName] = useState("")
  const [activeTab, setActiveTab] = useState("chat")
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    loadUserData()
    const savedDarkMode = localStorage.getItem("studentDarkMode")
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
      console.error("[Student] Failed to load user data:", error)
    }
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    localStorage.setItem("studentActiveTab", value)
  }

  const toggleDarkMode = () => {
    const newState = !isDarkMode
    setIsDarkMode(newState)
    localStorage.setItem("studentDarkMode", String(newState))
  }

  return (
    <div className={`h-screen flex flex-col ${isDarkMode ? "dark bg-gradient-to-br from-gray-900 to-blue-950" : "bg-gradient-to-br from-gray-50 to-blue-50/20"}`}>
      <header className={`border-b shadow-sm ${isDarkMode ? "bg-gray-800/90 border-gray-700" : "bg-white/80"} backdrop-blur-sm`}>
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${isDarkMode ? "bg-white/10" : "bg-gradient-to-br from-blue-600 to-indigo-700"}`}>
              <Bot className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className={`font-semibold ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}>Employee Portal</h1>
              <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>Welcome, {userName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={toggleDarkMode}
              className={`rounded-lg ${isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
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

      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="h-full flex flex-col">
          <div className={`border-b px-4 shadow-sm ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white"}`}>
            <TabsList className="h-12 bg-transparent">
              <TabsTrigger
                value="chat"
                className={`gap-2 ${isDarkMode ? "data-[state=active]:bg-blue-900/50 data-[state=active]:text-blue-300" : "data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700"}`}
              >
                <MessageSquare className="h-4 w-4" />
                Chat
              </TabsTrigger>
              <TabsTrigger
                value="classes"
                className={`gap-2 ${isDarkMode ? "data-[state=active]:bg-blue-900/50 data-[state=active]:text-blue-300" : "data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700"}`}
              >
                <BookOpen className="h-4 w-4" />
                Sectors
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="chat" className="h-full m-0">
              <StudentChatInterface showHeader={false} sidebarLayout="full" isDarkMode={isDarkMode} />
            </TabsContent>
            <TabsContent value="classes" className="h-full m-0">
              <StudentClassesTab isDarkMode={isDarkMode} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}
