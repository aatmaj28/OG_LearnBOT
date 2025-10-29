"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { GraduationCap, Users, Bot, Brain, Target, Zap, Eye, EyeOff } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [role, setRole] = useState("student")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Read role from URL params client-side only to avoid hydration errors
  useEffect(() => {
    const urlRole = searchParams.get("role") || "student"
    setRole(urlRole)
  }, [searchParams])

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
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4 py-8">
      <div className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col lg:flex-row">
        {/* Left Panel - Blue Informational Section */}
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 to-indigo-700 p-8 flex-col justify-between">
          <div>
            {/* Logo */}
            <div className="flex items-center gap-3 mb-4">
              <div className="relative w-16 h-16">
                <Image
                  src="/learnbot-logo.png"
                  alt="LearnBot Logo"
                  width={48}
                  height={48}
                  className="object-contain"
                  priority
                  sizes="90px"
                />
              </div>
              <span className="text-3xl font-bold text-white">LearnBot</span>
            </div>
            {/* Separator Line */}
            <div className="w-16 h-0.5 bg-white mb-6"></div>

            {/* Title */}
            <h1 className="text-5xl font-bold text-white mb-3">
              DMSB AI
            </h1>
            <h2 className="text-3xl font-medium text-blue-100 mb-4">
              Strategic Hub
            </h2>
            {/* Separator Line */}
            <div className="w-16 h-0.5 bg-white mb-6"></div>

            {/* Description */}
            <p className="text-lg text-blue-50 leading-relaxed">
              Empowering Northeastern's D'Amore-McKim School of Business with cutting-edge AI solutions and strategic insights.
            </p>
          </div>

          {/* Feature Icons */}
          <div className="flex gap-6 mt-8">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full border-2 border-white flex items-center justify-center">
                <Brain className="h-8 w-8 text-white" />
              </div>
              <span className="text-white text-sm font-medium">AI Powered</span>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full border-2 border-white flex items-center justify-center">
                <Target className="h-8 w-8 text-white" />
              </div>
              <span className="text-white text-sm font-medium">Strategic</span>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full border-2 border-white flex items-center justify-center">
                <Zap className="h-8 w-8 text-white" />
              </div>
              <span className="text-white text-sm font-medium">Innovative</span>
            </div>
          </div>
        </div>

        {/* Right Panel - White Login Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-8">
          <div className="w-full max-w-md">
            {/* Heading */}
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h2>
            {/* Blue Separator Line */}
            <div className="w-16 h-0.5 bg-blue-600 mb-3"></div>
            <p className="text-gray-600 mb-6">
              Enter your credentials to access your account
            </p>

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-900 font-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@northeastern.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 bg-gray-100 border-0 focus:bg-white focus:ring-2 focus:ring-blue-600 rounded-lg"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-900 font-medium">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-12 bg-gray-100 border-0 focus:bg-white focus:ring-2 focus:ring-blue-600 rounded-lg pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white text-base font-semibold rounded-lg" 
                disabled={loading}
              >
                {loading ? "Logging in..." : "Login"}
              </Button>

              <div className="text-center">
                <Link href="/forgot-password" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                  Forgot password?
                </Link>
              </div>

              <div className="text-center pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  Demo credentials:{" "}
                  <span className="font-mono text-xs text-gray-500">
                    {role === "student" ? "student@example.com / student123" : "faculty@example.com / faculty123"}
                  </span>
                </p>
              </div>
            </form>

            {/* Register Link */}
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-600">
                Don't have an account?{" "}
                <Link href={`/register?role=${role}`} className="text-blue-600 hover:text-blue-700 font-medium">
                  Register here
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
