import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GraduationCap, Users } from "lucide-react"

export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-balance mb-4">LearnBOT v1.0</h1>
          <p className="text-lg text-muted-foreground text-balance">
            AI-powered teaching assistant for students and faculty @Northeastern University
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <GraduationCap className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle>Student Portal</CardTitle>
              </div>
              <CardDescription>Access your AI learning assistant and view your chat history</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/login?role=student">
                <Button className="w-full" size="lg">
                  Student Login
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900 rounded-lg">
                  <Users className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <CardTitle>Faculty Portal</CardTitle>
              </div>
              <CardDescription>Manage classes, monitor student activity, and view analytics</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/login?role=faculty">
                <Button className="w-full" size="lg" variant="secondary">
                  Faculty Login
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>Enter any credentials to login - authentication is bypassed for demo purposes</p>
        </div>
      </div>
    </div>
  )
}
