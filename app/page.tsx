import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { GraduationCap, Users, Bot, BarChart3, Users2, MessageSquare, BookOpen, CheckCircle2 } from "lucide-react"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="w-full border-b bg-white">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/learnbot-logo.png"
              alt="LearnBot Logo"
              width={64}
              height={64}
              className="object-contain"
              priority
            />
            <span className="text-2xl font-bold text-gray-900">LearnBot</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login?role=student">
              <Button variant="ghost" size="sm">Student Login</Button>
            </Link>
            <Link href="/login?role=faculty">
              <Button variant="ghost" size="sm">Faculty Login</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-6 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Welcome Section */}
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold text-gray-900 mb-4">
                  Welcome to LearnBot!
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Explore our AI-powered applications designed to enhance your academic and professional experience.
            </p>
            <div className="w-24 h-1 bg-blue-600 mx-auto mt-6 rounded-full"></div>
          </div>

          {/* Application Cards */}
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Student Portal Card */}
            <Card className="border-2 border-gray-200 hover:border-blue-500 transition-all duration-300 hover:shadow-xl">
              <CardContent className="p-8 flex flex-col h-full">
                {/* Icon */}
                <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center mb-6">
                  <GraduationCap className="h-8 w-8 text-blue-600" />
                </div>

                {/* Title */}
                <h2 className="text-3xl font-bold text-gray-900 mb-3">Student Portal</h2>
                
                {/* Description */}
                <p className="text-gray-600 mb-6 text-base leading-relaxed">
                  Serves as a comprehensive learning assistant - your AI-powered Teaching Assistant for coursework and assignments.
                </p>

                {/* Features */}
                <ul className="space-y-3 mb-8 flex-1">
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 text-sm">Interactive AI chat assistant for personalized guidance</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 text-sm">RAG-powered responses with course materials</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 text-sm">Conversation history and saved sessions</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 text-sm">Class-specific learning support</span>
                  </li>
                </ul>

                {/* Launch Button */}
                <Link href="/login?role=student" className="mt-auto">
                  <Button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-base font-semibold py-6 rounded-lg shadow-lg hover:shadow-xl transition-all">
                    Launch Student Portal
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Faculty Portal Card */}
            <Card className="border-2 border-gray-200 hover:border-emerald-500 transition-all duration-300 hover:shadow-xl">
              <CardContent className="p-8 flex flex-col h-full">
                {/* Icon */}
                <div className="w-16 h-16 bg-emerald-100 rounded-xl flex items-center justify-center mb-6">
                  <Users className="h-8 w-8 text-emerald-600" />
                </div>

                {/* Title */}
                <h2 className="text-3xl font-bold text-gray-900 mb-3">Faculty Portal</h2>
                
                {/* Description */}
                <p className="text-gray-600 mb-6 text-base leading-relaxed">
                  Comprehensive dashboard for faculty to manage classes, monitor students, and track performance.
                </p>

                {/* Features */}
                <ul className="space-y-3 mb-8 flex-1">
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 text-sm">Class management and student enrollment</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 text-sm">Real-time student activity monitoring</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 text-sm">Advanced analytics and performance reports</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 text-sm">AI-powered insights and recommendations</span>
                  </li>
                </ul>

                {/* Launch Button */}
                <Link href="/login?role=faculty" className="mt-auto">
                  <Button className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-base font-semibold py-6 rounded-lg shadow-lg hover:shadow-xl transition-all">
                    Launch Faculty Portal
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white py-8 mt-16">
        <div className="container mx-auto px-6">
          <div className="flex flex-col items-center justify-center gap-4">
            {/* Social Links */}
            <div className="flex items-center gap-6">
              <a 
                href="https://www.linkedin.com/company/dmsb-ai-strategic-hub/posts/?feedView=all" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-blue-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
              <a 
                href="mailto:dashlab@northeastern.edu" 
                className="text-gray-600 hover:text-blue-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </a>
            </div>
            
            {/* Copyright */}
            <p className="text-sm text-gray-500 text-center">
              Powered by DASH Lab - AI Strategic Hub - Northeastern University
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
