"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Clock, MessageSquare, TrendingUp, BookOpen } from "lucide-react"
import type { Class } from "@/lib/types"

interface AnalyticsData {
  totalStudents: number
  totalChatTime: number
  totalSessions: number
  averageSentiment: number
  sentimentDistribution: { sentiment: string; count: number }[]
  topicDistribution: { topic: string; count: number }[]
  activityOverTime: { date: string; sessions: number; minutes: number }[]
  studentEngagement: { name: string; sessions: number; minutes: number }[]
}

export function AnalyticsTab() {
  const [classes, setClasses] = useState<Class[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string>("")
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)

  useEffect(() => {
    loadClasses()
  }, [])

  useEffect(() => {
    if (selectedClassId) {
      loadAnalytics()
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

  const loadAnalytics = async () => {
    if (!selectedClassId) return

    try {
      const response = await fetch(`/api/analytics/class-summary?classId=${selectedClassId}`)
      if (response.ok) {
        const data = await response.json()
        setAnalytics(data.analytics)
      }
    } catch (error) {
      console.error("[v0] Failed to load analytics:", error)
    }
  }

  const SENTIMENT_COLORS = {
    Positive: "#10b981", // Green
    Neutral: "#f59e0b",  // Amber
    Negative: "#ef4444", // Red
  }

  const CHART_COLORS = {
    primary: "#3b82f6",    // Blue
    secondary: "#8b5cf6",  // Purple
    accent: "#06b6d4",     // Cyan
    success: "#10b981",    // Green
    warning: "#f59e0b",    // Amber
    error: "#ef4444",      // Red
    info: "#06b6d4",       // Cyan
  }

  return (
    <div className="h-full flex flex-col p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Analytics Dashboard</h2>
        <p className="text-muted-foreground">Comprehensive insights into student engagement and learning patterns</p>
      </div>

      {classes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <p className="text-muted-foreground mb-2">No classes found</p>
            <p className="text-sm text-muted-foreground">Create a class to view class analytics</p>
          </div>
        </div>
      ) : !analytics ? (
        <div className="flex items-center justify-center py-30">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading analytics...</p>
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

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card className="border-l-4 border-l-blue-500">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Students</CardTitle>
                <BookOpen className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{analytics.totalStudents}</div>
                <p className="text-xs text-muted-foreground mt-1">Active learners</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-green-500">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Chat Time</CardTitle>
                <Clock className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{analytics.totalChatTime} min</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {Math.round(analytics.totalChatTime / 60)} hours of learning
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-purple-500">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
                <MessageSquare className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">{analytics.totalSessions}</div>
                <p className="text-xs text-muted-foreground mt-1">Conversations started</p>
              </CardContent>
            </Card>

            <Card className={`border-l-4 ${
              analytics.averageSentiment > 0.3 
                ? 'border-l-green-500' 
                : analytics.averageSentiment < -0.3 
                ? 'border-l-red-500' 
                : 'border-l-yellow-500'
            }`}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Average Sentiment</CardTitle>
                <TrendingUp className={`h-4 w-4 ${
                  analytics.averageSentiment > 0.3 
                    ? 'text-green-500' 
                    : analytics.averageSentiment < -0.3 
                    ? 'text-red-500' 
                    : 'text-yellow-500'
                }`} />
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold ${
                    analytics.averageSentiment > 0.3
                      ? "text-green-600 dark:text-green-400"
                      : analytics.averageSentiment < -0.3
                        ? "text-red-600 dark:text-red-400"
                        : "text-yellow-600 dark:text-yellow-400"
                  }`}
                >
                  {analytics.averageSentiment > 0.3
                    ? "Positive"
                    : analytics.averageSentiment < -0.3
                      ? "Negative"
                      : "Neutral"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Overall class mood</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Sentiment Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Sentiment Distribution</CardTitle>
                <CardDescription>Overall emotional tone of student interactions</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    count: {
                      label: "Sessions",
                      color: "hsl(var(--chart-1))",
                    },
                  }}
                  className="h-[300px]"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Pie
                        data={analytics.sentimentDistribution}
                        dataKey="count"
                        nameKey="sentiment"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label
                      >
                        {analytics.sentimentDistribution.map((entry) => (
                          <Cell
                            key={entry.sentiment}
                            fill={SENTIMENT_COLORS[entry.sentiment as keyof typeof SENTIMENT_COLORS]}
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Topic Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Popular Topics</CardTitle>
                <CardDescription>Most discussed subjects in conversations</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    count: {
                      label: "Mentions",
                      color: CHART_COLORS.accent,
                    },
                  }}
                  className="h-[300px]"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.topicDistribution} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="topic" 
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        axisLine={{ stroke: '#d1d5db' }}
                      />
                      <YAxis 
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        axisLine={{ stroke: '#d1d5db' }}
                      />
                      <ChartTooltip 
                        content={<ChartTooltipContent 
                          formatter={(value) => [`${value} mentions`, '']}
                        />} 
                      />
                      <Bar 
                        dataKey="count" 
                        fill={CHART_COLORS.accent}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          {/* Activity Over Time and Student Engagement */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Activity Over Time */}
            <Card>
              <CardHeader>
                <CardTitle>Activity Over Time</CardTitle>
                <CardDescription>Daily student engagement (last 7 days)</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    sessions: {
                      label: "Sessions",
                      color: CHART_COLORS.primary,
                    },
                    minutes: {
                      label: "Minutes",
                      color: CHART_COLORS.secondary,
                    },
                  }}
                  className="h-[350px]"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.activityOverTime} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        axisLine={{ stroke: '#d1d5db' }}
                      />
                      <YAxis 
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        axisLine={{ stroke: '#d1d5db' }}
                      />
                      <ChartTooltip 
                        content={<ChartTooltipContent 
                          formatter={(value, name) => [
                            name === 'sessions' ? `${value} sessions` : `${value} min`,
                            name === 'sessions' ? 'Sessions' : ''
                          ]}
                        />} 
                      />
                      <Bar 
                        dataKey="sessions" 
                        fill={CHART_COLORS.primary}
                        name="Sessions"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar 
                        dataKey="minutes" 
                        fill={CHART_COLORS.secondary}
                        name="Minutes"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Student Engagement */}
            <Card>
              <CardHeader>
                <CardTitle>Student Engagement</CardTitle>
                <CardDescription>Individual student activity levels</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    sessions: {
                      label: "Sessions",
                      color: CHART_COLORS.success,
                    },
                    minutes: {
                      label: "Minutes",
                      color: CHART_COLORS.warning,
                    },
                  }}
                  className="h-[350px]"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.studentEngagement} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="name" 
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        axisLine={{ stroke: '#d1d5db' }}
                      />
                      <YAxis 
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        axisLine={{ stroke: '#d1d5db' }}
                      />
                      <ChartTooltip 
                        content={<ChartTooltipContent 
                          formatter={(value, name) => [
                            name === 'sessions' ? `${value} sessions` : `${value} min`,
                            name === 'sessions' ? 'Sessions' : ''
                          ]}
                        />} 
                      />
                      <Bar 
                        dataKey="sessions" 
                        fill={CHART_COLORS.success}
                        name="Sessions"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar 
                        dataKey="minutes" 
                        fill={CHART_COLORS.warning}
                        name="Minutes"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
