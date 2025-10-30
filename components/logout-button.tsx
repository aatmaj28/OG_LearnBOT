"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"

export function LogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    const sessionId = localStorage.getItem("sessionId")

    if (sessionId) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      })
    }

    localStorage.clear()
    
    // Show success toast
    toast.success('Logged out successfully', {
      description: 'You have been logged out.'
    })
    
    // Small delay to show toast before redirect
    await new Promise(resolve => setTimeout(resolve, 500))
    
    router.push("/")
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleLogout}>
      <LogOut className="h-4 w-4 mr-2" />
      Logout
    </Button>
  )
}
