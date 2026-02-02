"use client"

import type React from "react"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { GraduationCap, Users, Brain, Target, Zap, Eye, EyeOff } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

function RegisterPageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  )
}

function RegisterContent() {
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
  
  // Email verification state
  const [step, setStep] = useState<'register' | 'verify' | 'success'>('register')
  const [otp, setOtp] = useState('')
  const [otpError, setOtpError] = useState('')
  const [resendCountdown, setResendCountdown] = useState(0)

  // Password strength state
  const [passwordStrength, setPasswordStrength] = useState({
    hasMinLength: false,
    hasUppercase: false,
    hasLowercase: false,
    hasNumber: false,
    hasSpecial: false,
    isRecommendedLength: false,
    score: 0
  })

  // Read role from URL params client-side only to avoid hydration errors
  useEffect(() => {
    const urlRole = searchParams.get("role") || "student"
    setRole(urlRole)
  }, [searchParams])

  // Check password strength whenever password changes
  useEffect(() => {
    const checkPasswordStrength = () => {
      const hasMinLength = password.length >= 8
      const hasUppercase = /[A-Z]/.test(password)
      const hasLowercase = /[a-z]/.test(password)
      const hasNumber = /[0-9]/.test(password)
      const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
      const isRecommendedLength = password.length >= 12

      // Calculate score (0-6)
      let score = 0
      if (hasMinLength) score++
      if (hasUppercase) score++
      if (hasLowercase) score++
      if (hasNumber) score++
      if (hasSpecial) score++
      if (isRecommendedLength) score++

      setPasswordStrength({
        hasMinLength,
        hasUppercase,
        hasLowercase,
        hasNumber,
        hasSpecial,
        isRecommendedLength,
        score
      })
    }

    checkPasswordStrength()
  }, [password])

  // Countdown timer for resend OTP
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => {
        setResendCountdown(resendCountdown - 1)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCountdown])

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

    // Check password strength requirements
    if (!passwordStrength.hasMinLength) {
      setError("Password must be at least 8 characters")
      return
    }
    if (!passwordStrength.hasUppercase) {
      setError("Password must contain at least one uppercase letter")
      return
    }
    if (!passwordStrength.hasLowercase) {
      setError("Password must contain at least one lowercase letter")
      return
    }
    if (!passwordStrength.hasNumber) {
      setError("Password must contain at least one number")
      return
    }
    if (!passwordStrength.hasSpecial) {
      setError("Password must contain at least one special character")
      return
    }

    setLoading(true)

    try {
      // Send OTP instead of creating account directly
      const { authApi } = await import("@/lib/flask-api-client")
      const data = await authApi.sendOtp(email, password, name, role, nuid, degree, major)

      if (!data.success) {
        setError(data.error || "Failed to send verification code")
        setLoading(false)
        return
      }

      // Move to verification step
      setStep('verify')
      setResendCountdown(60) // 60 seconds before resend is allowed
      setLoading(false)
    } catch (err) {
      console.error("Registration error:", err)
      setError("An error occurred. Please try again.")
      setLoading(false)
    }
  }

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    setOtpError("")

    if (!otp || otp.length !== 6) {
      setOtpError("Please enter a valid 6-digit code")
      return
    }

    setLoading(true)

    try {
      const { authApi } = await import("@/lib/flask-api-client")
      const data = await authApi.verifyOtp(email, otp)

      if (!data.success) {
        setOtpError(data.error || "Invalid verification code")
        setLoading(false)
        return
      }

      // Store session
      localStorage.setItem("sessionId", data.sessionId)
      localStorage.setItem("userId", data.user.id)
      localStorage.setItem("userRole", data.user.role)

      // Move to success step
      setStep('success')
      setLoading(false)
    } catch (err) {
      console.error("Verification error:", err)
      setOtpError("An error occurred. Please try again.")
      setLoading(false)
    }
  }

  const handleResendOTP = async () => {
    if (resendCountdown > 0) return

    setOtpError("")
    setLoading(true)

    try {
      const { authApi } = await import("@/lib/flask-api-client")
      const data = await authApi.sendOtp(email, password, name, role, nuid, degree, major)

      if (!data.success) {
        setOtpError(data.error || "Failed to resend code")
        setLoading(false)
        return
      }

      setResendCountdown(60)
      setLoading(false)
    } catch (err) {
      console.error("Resend error:", err)
      setOtpError("Failed to resend code. Please try again.")
      setLoading(false)
    }
  }

  const handleGoToLogin = () => {
    router.push('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50/30 p-4 py-8">
      <div className="w-full max-w-6xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col lg:flex-row">
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
            {/* STEP 1: Registration Form */}
            {step === 'register' && (
              <>
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
              </>
            )}

            {/* STEP 2: Email Verification */}
            {step === 'verify' && (
              <>
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Verify Your Email</h2>
                <div className="w-16 h-0.5 bg-blue-600 mb-3"></div>
                <p className="text-gray-600 mb-6">
                  We've sent a verification code to <span className="font-medium">{email}</span>
                </p>
              </>
            )}

            {/* STEP 3: Success */}
            {step === 'success' && (
              <>
                <div className="text-center mb-8">
                  <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="text-3xl font-bold text-gray-900 mb-2">Account Created Successfully!</h2>
                  <div className="w-16 h-0.5 bg-green-600 mb-4 mx-auto"></div>
                  <p className="text-gray-600 mb-2">
                    Welcome to LearnBOT Portal!
                  </p>
                  <p className="text-sm text-gray-500">
                    Hello <span className="font-medium">{name}</span>! Your {role} account has been verified and is ready to use.
                  </p>
                </div>
              </>
            )}

            {/* STEP 1: Registration Form */}
            {step === 'register' && (
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
                
                {/* Password Strength Indicator */}
                {password && (
                  <div className="space-y-2 mt-2">
                    {/* Strength Bar */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-300 ${
                            passwordStrength.score <= 2 ? 'bg-red-500' :
                            passwordStrength.score <= 4 ? 'bg-yellow-500' :
                            passwordStrength.score === 5 ? 'bg-blue-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${(passwordStrength.score / 6) * 100}%` }}
                        />
                      </div>
                      <span className={`text-xs font-medium ${
                        passwordStrength.score <= 2 ? 'text-red-600' :
                        passwordStrength.score <= 4 ? 'text-yellow-600' :
                        passwordStrength.score === 5 ? 'text-blue-600' :
                        'text-green-600'
                      }`}>
                        {passwordStrength.score <= 2 ? 'Weak' :
                         passwordStrength.score <= 4 ? 'Fair' :
                         passwordStrength.score === 5 ? 'Good' :
                         'Strong'}
                      </span>
                    </div>
                    
                    {/* Requirements Checklist */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div className={`flex items-center gap-1 ${passwordStrength.hasMinLength ? 'text-green-600' : 'text-gray-500'}`}>
                        <span>{passwordStrength.hasMinLength ? '✓' : '○'}</span>
                        <span>At least 8 characters</span>
                      </div>
                      <div className={`flex items-center gap-1 ${passwordStrength.hasUppercase ? 'text-green-600' : 'text-gray-500'}`}>
                        <span>{passwordStrength.hasUppercase ? '✓' : '○'}</span>
                        <span>At least one uppercase letter</span>
                      </div>
                      <div className={`flex items-center gap-1 ${passwordStrength.hasLowercase ? 'text-green-600' : 'text-gray-500'}`}>
                        <span>{passwordStrength.hasLowercase ? '✓' : '○'}</span>
                        <span>At least one lowercase letter</span>
                      </div>
                      <div className={`flex items-center gap-1 ${passwordStrength.hasNumber ? 'text-green-600' : 'text-gray-500'}`}>
                        <span>{passwordStrength.hasNumber ? '✓' : '○'}</span>
                        <span>At least one number</span>
                      </div>
                      <div className={`flex items-center gap-1 ${passwordStrength.hasSpecial ? 'text-green-600' : 'text-gray-500'}`}>
                        <span>{passwordStrength.hasSpecial ? '✓' : '○'}</span>
                        <span>At least one special character</span>
                      </div>
                      <div className={`flex items-center gap-1 ${passwordStrength.isRecommendedLength ? 'text-green-600' : 'text-gray-500'}`}>
                        <span>{passwordStrength.isRecommendedLength ? '✓' : '○'}</span>
                        <span>12+ characters (recommended)</span>
                      </div>
                    </div>
                  </div>
                )}
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
                className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-base font-semibold rounded-lg shadow-md hover:shadow-lg transition-all mt-4" 
                disabled={loading}
              >
                {loading ? "Creating account..." : "Register"}
              </Button>

              <div className="text-center pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  Demo credentials:{" "}
                  <span className="font-mono text-xs text-gray-500">
                    {role === "student" ? "student@northeastern.edu / student123" : "faculty@northeastern.edu / faculty123"}
                  </span>
                </p>
              </div>
              </form>
            )}

            {/* STEP 2: OTP Verification Form */}
            {step === 'verify' && (
              <form onSubmit={handleVerifyOTP} className="space-y-4">
                {otpError && (
                  <Alert variant="destructive">
                    <AlertDescription>{otpError}</AlertDescription>
                  </Alert>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-blue-800 text-center">
                    Please check your email for the verification code. The code expires in <span className="font-semibold">10 minutes</span>.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="otp" className="text-gray-900 font-medium">Your verification code is:</Label>
                  <Input
                    id="otp"
                    type="text"
                    placeholder="000000"
                    value={otp}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6)
                      setOtp(value)
                    }}
                    maxLength={6}
                    className="h-16 bg-gray-100 border-0 focus:bg-white focus:ring-2 focus:ring-blue-600 rounded-lg text-center text-3xl font-mono tracking-widest"
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 text-center">Enter the 6-digit code</p>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-base font-semibold rounded-lg shadow-md hover:shadow-lg transition-all" 
                  disabled={loading || otp.length !== 6}
                >
                  {loading ? "Verifying..." : "Verify Code"}
                </Button>

                <div className="text-center pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-600">
                    Didn't receive the code?{" "}
                    {resendCountdown > 0 ? (
                      <span className="text-gray-400">Resend in {resendCountdown}s</span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendOTP}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                        disabled={loading}
                      >
                        Resend Code
                      </button>
                    )}
                  </p>
                </div>

                <div className="text-center">
                  <p className="text-xs text-gray-500">
                    If you didn't request this verification, please ignore this.
                  </p>
                </div>
              </form>
            )}

            {/* STEP 3: Success Message with Login Button */}
            {step === 'success' && (
              <div className="space-y-4">
                <Button 
                  onClick={handleGoToLogin}
                  className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-base font-semibold rounded-lg shadow-md hover:shadow-lg transition-all"
                >
                  Go to Login
                </Button>

                <div className="text-center">
                  <p className="text-sm text-gray-600">
                    You can now log in with your credentials
                  </p>
                </div>
              </div>
            )}

            {/* Login Link (only show on register step) */}
            {step === 'register' && (
              <div className="mt-4 text-center">
                <p className="text-sm text-gray-600">
                  Already have an account?{" "}
                  <Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium">
                    Login here
                  </Link>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<RegisterPageFallback />}>
      <RegisterContent />
    </Suspense>
  )
}
