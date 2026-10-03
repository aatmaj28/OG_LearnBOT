"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Users, ChevronRight, FolderOpen } from "lucide-react"
import type { Class } from "@/lib/types"
import { EmployeeTeamDetail } from "@/components/employee-team-detail"

interface StudentClassesTabProps {
  isDarkMode?: boolean
  // Opens the chat scoped to a team + document. An empty fileName means every document
  // in that team.
  onOpenDocument?: (classId: string, fileName: string) => void
}

export function StudentClassesTab({ isDarkMode = false, onOpenDocument }: StudentClassesTabProps) {
  const [classes, setClasses] = useState<Class[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedClass, setSelectedClass] = useState<Class | null>(null)

  useEffect(() => {
    loadClasses()
  }, [])

  const loadClasses = async () => {
    const studentId = localStorage.getItem("userId")
    if (!studentId) {
      setIsLoading(false)
      return
    }
    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      // Already scoped to the teams the manager assigned this employee to.
      const data = (await classesApi.getClasses(undefined, studentId)) as { classes?: Class[] }
      setClasses(data.classes || [])
    } catch (error) {
      console.error("[Employee] Failed to load teams:", error)
      setClasses([])
    } finally {
      setIsLoading(false)
    }
  }

  if (selectedClass) {
    return (
      <EmployeeTeamDetail
        team={selectedClass}
        isDarkMode={isDarkMode}
        onBack={() => setSelectedClass(null)}
        onOpenDocument={(classId, fileName) => onOpenDocument?.(classId, fileName)}
      />
    )
  }

  return (
    <div className="h-full overflow-hidden">
      <ScrollArea className="h-full">
        <div className="max-w-5xl mx-auto p-6">
          <div className="mb-6">
            <h2 className={`text-2xl font-bold mb-1 ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}>My Teams</h2>
            <p className={isDarkMode ? "text-gray-400" : "text-gray-600"}>
              Open a team to see the documents you'll be learning from.
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : classes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div
                className={`p-4 rounded-full w-20 h-20 mb-6 flex items-center justify-center shadow-lg ${
                  isDarkMode
                    ? "bg-gradient-to-br from-blue-900 to-indigo-900"
                    : "bg-gradient-to-br from-blue-100 to-indigo-100"
                }`}
              >
                <FolderOpen className={`h-10 w-10 ${isDarkMode ? "text-blue-400" : "text-blue-600"}`} />
              </div>
              <h3 className={`text-xl font-bold mb-2 ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}>
                No teams yet
              </h3>
              <p className={`max-w-md ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                You are not assigned to any teams yet. Your manager will add you to a team, and its documents will show
                up here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {classes.map((classItem) => (
                <Card
                  key={classItem.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedClass(classItem)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      setSelectedClass(classItem)
                    }
                  }}
                  className={`p-4 cursor-pointer transition-colors ${
                    isDarkMode
                      ? "bg-gray-800 border-gray-700 hover:bg-gray-700"
                      : "bg-white border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={`font-semibold ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}>
                      {classItem.name}
                    </p>
                    <ChevronRight className={`h-4 w-4 flex-shrink-0 mt-0.5 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`} />
                  </div>
                  {classItem.description && (
                    <p className={`text-sm mt-2 line-clamp-3 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                      {classItem.description}
                    </p>
                  )}
                  <div className={`flex items-center gap-1 mt-4 text-xs ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}>
                    <Users className="h-3 w-3" />
                    <span>Team</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
