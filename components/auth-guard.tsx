"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { UserRole } from "@/lib/types"

interface AuthGuardProps {
  children: React.ReactNode
  requiredRole?: UserRole
}

export function AuthGuard({ children, requiredRole }: AuthGuardProps) {
  const router = useRouter()
  const [isAuthorized, setIsAuthorized] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      console.log("[v0] AUTHGUARD: Starting auth check")
      
      const sessionId = localStorage.getItem("sessionId")
      const userRole = localStorage.getItem("userRole") as UserRole

      console.log("[v0] AUTHGUARD: Retrieved from localStorage - sessionId:", sessionId, "userRole:", userRole)

      if (!sessionId) {
        console.log("[v0] AUTHGUARD: No sessionId found, redirecting to login")
        router.push("/login")
        return
      }

      // Add a small delay to ensure session is fully established
      console.log("[v0] AUTHGUARD: Waiting 100ms before session check")
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify session with server
      try {
        console.log("[v0] AUTHGUARD: Sending session verification request")
        const response = await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        })

        console.log("[v0] AUTHGUARD: Session verification response status:", response.status)

        if (!response.ok) {
          console.error("[v0] AUTHGUARD: Session verification failed:", response.status, response.statusText)
          const errorData = await response.json()
          console.error("[v0] AUTHGUARD: Error details:", errorData)
          localStorage.clear()
          router.push("/login")
          return
        }

        const data = await response.json()
        console.log("[v0] AUTHGUARD: Session verification successful:", data)

        // Check role if required
        if (requiredRole && data.user.role !== requiredRole) {
          console.error("[v0] AUTHGUARD: Role mismatch:", data.user.role, "expected:", requiredRole)
          router.push("/login")
          return
        }

        console.log("[v0] AUTHGUARD: Authorization successful, setting isAuthorized to true")
        setIsAuthorized(true)
      } catch (error) {
        console.error("[v0] AUTHGUARD: Auth check error:", error)
        localStorage.clear()
        router.push("/login")
      }
    }

    checkAuth()
  }, [router, requiredRole])

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Verifying authentication...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
