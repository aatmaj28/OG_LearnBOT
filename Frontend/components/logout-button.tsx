"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"
import { authApi } from "@/lib/flask-api-client"

export function LogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    const sessionId = localStorage.getItem("sessionId")

    if (sessionId) {
      try {
        await authApi.logout(sessionId)
      } catch (error) {
        console.error("[LOGOUT] Error logging out:", error)
        // Continue with logout even if API call fails
      }
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
    <Button 
      variant="ghost" 
      size="sm" 
      onClick={handleLogout}
      className="text-gray-700 hover:text-yellow-500 dark:text-gray-100 dark:hover:text-yellow-400 dark:hover:bg-gray-700"
    >
      <LogOut className="h-4 w-4 mr-2" />
      Logout
    </Button>
  )
}
