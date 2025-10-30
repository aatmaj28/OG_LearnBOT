"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { GraduationCap, Users, Brain, Target, Zap, Eye, EyeOff } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

export default function RegisterPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [role, setRole] = useState("student")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [nuid, setNuid] = useState("")
  const [degree, setDegree] = useState("")
  const [major, setMajor] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Read role from URL params client-side only to avoid hydration errors
  useEffect(() => {
    const urlRole = searchParams.get("role") || "student"
    setRole(urlRole)
  }, [searchParams])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    // Validation
    if (!name || !email || !password || !confirmPassword) {
      setError("All fields are required")
      return
    }

    if (role === "student" && !nuid) {
      setError("NUID is required for students")
      return
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters")
      return
    }

    setLoading(true)

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name,
          role,
          nuid: role === "student" ? nuid : undefined,
          degree: role === "student" ? degree : undefined,
          major: role === "student" ? major : undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Registration failed")
        setLoading(false)
        return
      }

      // Store session
      localStorage.setItem("sessionId", data.sessionId)
      localStorage.setItem("userId", data.user.id)
      localStorage.setItem("userRole", data.user.role)

      // Redirect based on role
      if (data.user.role === "student") {
        router.push("/student/chat")
      } else {
        router.push("/faculty/dashboard")
      }
    } catch (err) {
      console.error("Registration error:", err)
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
              <Image
                src="/learnbot-logo.png"
                alt="LearnBot Logo"
                width={48}
                height={48}
                className="object-contain"
                priority
              />
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

        {/* Right Panel - White Registration Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-8">
          <div className="w-full max-w-md">
            {/* Heading */}
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Create Account</h2>
            {/* Blue Separator Line */}
            <div className="w-16 h-0.5 bg-blue-600 mb-3"></div>
            <p className="text-gray-600 mb-6">
              Sign up to access your {role} portal
            </p>

            {/* Role Indicator */}
            <div className="mb-4 flex items-center gap-2">
              <div className={`p-2 rounded-lg ${role === "student" ? "bg-blue-100" : "bg-indigo-100"}`}>
                {role === "student" ? (
                  <GraduationCap className={`h-5 w-5 text-blue-600`} />
                ) : (
                  <Users className={`h-5 w-5 text-indigo-600`} />
                )}
              </div>
              <span className="text-sm font-medium text-gray-700 capitalize">{role} Registration</span>
            </div>

            {/* Registration Form */}
            <form onSubmit={handleRegister} className="space-y-3">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="name" className="text-gray-900 font-medium">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="h-12 bg-gray-100 border-0 focus:bg-white focus:ring-2 focus:ring-blue-600 rounded-lg"
                />
              </div>

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

              {role === "student" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="nuid" className="text-gray-900 font-medium">NUID</Label>
                    <Input
                      id="nuid"
                      type="text"
                      placeholder="12345678"
                      value={nuid}
                      onChange={(e) => setNuid(e.target.value)}
                      required
                      className="h-12 bg-gray-100 border-0 focus:bg-white focus:ring-2 focus:ring-blue-600 rounded-lg"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="degree" className="text-gray-900 font-medium">Degree</Label>
                    <Input
                      id="degree"
                      type="text"
                      placeholder="Bachelor of Science"
                      value={degree}
                      onChange={(e) => setDegree(e.target.value)}
                      className="h-12 bg-gray-100 border-0 focus:bg-white focus:ring-2 focus:ring-blue-600 rounded-lg"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="major" className="text-gray-900 font-medium">Major</Label>
                    <Input
                      id="major"
                      type="text"
                      placeholder="Computer Science"
                      value={major}
                      onChange={(e) => setMajor(e.target.value)}
                      className="h-12 bg-gray-100 border-0 focus:bg-white focus:ring-2 focus:ring-blue-600 rounded-lg"
                    />
                  </div>
                </>
              )}

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

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-gray-900 font-medium">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="h-12 bg-gray-100 border-0 focus:bg-white focus:ring-2 focus:ring-blue-600 rounded-lg pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white text-base font-semibold rounded-lg mt-4" 
                disabled={loading}
              >
                {loading ? "Creating account..." : "Register"}
              </Button>

              <div className="text-center pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  Demo credentials:{" "}
                  <span className="font-mono text-xs text-gray-500">
                    {role === "student" ? "student@example.com / student123" : "faculty@example.com / faculty123"}
                  </span>
                </p>
              </div>
            </form>

            {/* Login Link */}
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-600">
                Already have an account?{" "}
                <Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium">
                  Login here
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

