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
  // Teams-first: the employee starts on their assigned teams, not an empty chat box.
  const [activeTab, setActiveTab] = useState("classes")
  const [isDarkMode, setIsDarkMode] = useState(false)
  // The team + document the chat is scoped to when the employee opens one from My Teams.
  // null means "no explicit scope" — the chat then behaves exactly as it always has.
  const [chatScope, setChatScope] = useState<{ classId: string; document: string } | null>(null)

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

  // Opening a document from My Teams drops the employee into the chat already pointed at
  // that team + document. An empty fileName means every document in the team.
  const openDocumentInChat = (classId: string, fileName: string) => {
    setChatScope({ classId, document: fileName })
    handleTabChange("chat")
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
                value="classes"
                className={`gap-2 ${isDarkMode ? "data-[state=active]:bg-blue-900/50 data-[state=active]:text-blue-300" : "data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700"}`}
              >
                <BookOpen className="h-4 w-4" />
                My Teams
              </TabsTrigger>
              <TabsTrigger
                value="chat"
                className={`gap-2 ${isDarkMode ? "data-[state=active]:bg-blue-900/50 data-[state=active]:text-blue-300" : "data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700"}`}
              >
                <MessageSquare className="h-4 w-4" />
                Chat
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="classes" className="h-full m-0">
              <StudentClassesTab isDarkMode={isDarkMode} onOpenDocument={openDocumentInChat} />
            </TabsContent>
            <TabsContent value="chat" className="h-full m-0">
              {/* Keyed on the scope so picking a different document re-opens the chat on it;
                  with no scope this is the same standalone chat as before. */}
              <StudentChatInterface
                key={chatScope ? `${chatScope.classId}::${chatScope.document}` : "unscoped"}
                showHeader={false}
                sidebarLayout="full"
                isDarkMode={isDarkMode}
                initialClassId={chatScope?.classId}
                initialDocument={chatScope?.document}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}
