"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Clock, MessageSquare, TrendingUp, Users } from "lucide-react"
import type { Class, User } from "@/lib/types"

interface StudentActivityData {
  student: User
  totalChatTime: number
  totalSessions: number
  averageSentiment: number
  topTopics: { topic: string; count: number }[]
  sentimentWords: string[]
  lastActive: Date
}

interface StudentMonitoringTabProps {
  isDarkMode?: boolean
}

const ALL_SECTORS = "all-sectors"

export function StudentMonitoringTab({ isDarkMode = false }: StudentMonitoringTabProps) {
  const [classes, setClasses] = useState<Class[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string>(ALL_SECTORS)
  // Activity per team, so "All teams" can show everyone with the team they belong to.
  const [activitiesBySector, setActivitiesBySector] = useState<Record<string, StudentActivityData[]>>({})
  const [isLoading, setIsLoading] = useState(false)

  const loadClasses = async () => {
    const facultyId = localStorage.getItem("userId")
    if (!facultyId) return

    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      const data = await classesApi.getClasses(facultyId)
      setClasses(data.classes ?? [])
    } catch (error) {
      console.error("[v0] Failed to load sectors:", error)
    }
  }

  const loadEmployeeActivities = useCallback(async () => {
    const sectors = selectedClassId === ALL_SECTORS
      ? classes
      : classes.filter((c) => c.id === selectedClassId)
    if (sectors.length === 0) return

    setIsLoading(true)
    try {
      const { analyticsApi } = await import("@/lib/flask-api-client")
      const results = await Promise.all(
        sectors.map(async (sector) => {
          try {
            const data = await analyticsApi.getClassActivity(sector.id) as { activities: StudentActivityData[] }
            return [sector.id, data.activities ?? []] as const
          } catch {
            // One team failing shouldn't blank out the whole list.
            return [sector.id, [] as StudentActivityData[]] as const
          }
        })
      )
      setActivitiesBySector(Object.fromEntries(results))
    } finally {
      setIsLoading(false)
    }
  }, [selectedClassId, classes])

  useEffect(() => {
    loadClasses()
  }, [])

  useEffect(() => {
    if (classes.length > 0) {
      loadEmployeeActivities()
    }
  }, [classes, loadEmployeeActivities])

  // Refresh activity (sentiment and topics) every hour
  useEffect(() => {
    if (classes.length === 0) return
    const refreshInterval = setInterval(() => {
      loadEmployeeActivities()
    }, 60 * 60 * 1000)
    return () => clearInterval(refreshInterval)
  }, [classes, loadEmployeeActivities])

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

  // Flatten into one row per employee, tagged with the team they belong to.
  const sectorName = (classId: string) => classes.find((c) => c.id === classId)?.name ?? "Unknown team"
  const employees = Object.entries(activitiesBySector).flatMap(([classId, activities]) =>
    activities.map((activity) => ({ ...activity, classId, sectorName: sectorName(classId) }))
  )

  return (
    <div className="h-full flex flex-col p-6">
      <div className="mb-6">
        <h2 className={`text-2xl font-bold mb-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Employees</h2>
        <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
          Onboarding activity for every employee, by team
        </p>
      </div>

      {classes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <p className="text-muted-foreground mb-2">No teams found</p>
            <p className="text-sm text-muted-foreground">Create a team to start onboarding employees</p>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-6 flex items-center gap-4">
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger className={`w-[300px] ${isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'border-gray-300'}`}>
                <SelectValue placeholder="Select a team" />
              </SelectTrigger>
              <SelectContent className={isDarkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : ''}>
                <SelectItem value={ALL_SECTORS} className={isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100' : ''}>
                  All teams
                </SelectItem>
                {classes.map((classItem) => (
                  <SelectItem key={classItem.id} value={classItem.id} className={isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100' : ''}>
                    {classItem.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isLoading && employees.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {employees.length} employee{employees.length === 1 ? '' : 's'}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              {isLoading && employees.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Loading employees...</p>
              ) : employees.length === 0 ? (
                <div className="text-center py-16">
                  <div className={`p-4 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center ${isDarkMode ? 'bg-indigo-900' : 'bg-indigo-100'}`}>
                    <Users className={`h-10 w-10 ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
                  </div>
                  <h3 className={`text-xl font-bold mb-3 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>No employees yet</h3>
                  <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
                    Add employees to a team to see their onboarding activity here
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 pr-2">
                  {employees.map((employee) => (
                    <Card key={`${employee.classId}-${employee.student.id}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <CardTitle className="text-base truncate">{employee.student.name}</CardTitle>
                            <CardDescription className="text-xs truncate">{employee.student.email}</CardDescription>
                          </div>
                          <Badge variant="secondary" className="text-xs flex-shrink-0">
                            {employee.sectorName}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>{employee.totalChatTime} min</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MessageSquare className="h-4 w-4" />
                            <span>{employee.totalSessions} chats</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                            <span className={getSentimentColor(employee.averageSentiment)}>
                              {getSentimentLabel(employee.averageSentiment)}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            Last active {new Date(employee.lastActive).toLocaleDateString()}
                          </span>
                        </div>
                        {employee.topTopics.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {employee.topTopics.slice(0, 3).map((topic) => (
                              <Badge key={topic.topic} variant="outline" className="text-xs">
                                {topic.topic}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </>
      )}
    </div>
  )
}
