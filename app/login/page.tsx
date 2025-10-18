"use client"

import type React from "react"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { GraduationCap, Users, ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const role = searchParams.get("role") || "student"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    console.log("[v0] FRONTEND: Starting login for:", email, "role:", role)

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role }),
      })

      console.log("[v0] FRONTEND: Login response status:", response.status)

      const data = await response.json()
      console.log("[v0] FRONTEND: Login response data:", data)

      if (!response.ok) {
        console.log("[v0] FRONTEND: Login failed:", data.error)
        setError(data.error || "Login failed")
        setLoading(false)
        return
      }

      // Store session
      console.log("[v0] FRONTEND: Storing session in localStorage:", data.sessionId)
      localStorage.setItem("sessionId", data.sessionId)
      localStorage.setItem("userId", data.user.id)
      localStorage.setItem("userRole", data.user.role)

      console.log("[v0] FRONTEND: Login successful, session stored:", data.sessionId)
      console.log("[v0] FRONTEND: Stored userId:", data.user.id)
      console.log("[v0] FRONTEND: Stored userRole:", data.user.role)

      // Add a small delay before redirect to ensure localStorage is set
      await new Promise(resolve => setTimeout(resolve, 50))

      console.log("[v0] FRONTEND: Redirecting to:", data.user.role === "student" ? "/student/chat" : "/faculty/dashboard")

      // Redirect based on role
      if (data.user.role === "student") {
        router.push("/student/chat")
      } else {
        router.push("/faculty/dashboard")
      }
    } catch (err) {
      console.error("[v0] FRONTEND: Login error:", err)
      setError("An error occurred. Please try again.")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div
                className={`p-2 rounded-lg ${role === "student" ? "bg-blue-100 dark:bg-blue-900" : "bg-indigo-100 dark:bg-indigo-900"}`}
              >
                {role === "student" ? (
                  <GraduationCap className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                ) : (
                  <Users className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                )}
              </div>
              <CardTitle>{role === "student" ? "Student" : "Faculty"} Login</CardTitle>
            </div>
            <CardDescription>Enter your credentials to access your {role} portal</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Logging in..." : "Login"}
              </Button>

              <div className="text-sm text-muted-foreground text-center mt-4">
                <p>Demo credentials:</p>
                <p className="font-mono text-xs mt-1">
                  {role === "student" ? "student@example.com / student123" : "faculty@example.com / faculty123"}
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
