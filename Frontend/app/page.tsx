import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { User, Users, Bot, CheckCircle2 } from "lucide-react"

// UI labels are Manager / Employee; the login route still uses the backend role values
// "faculty" (Manager) and "student" (Employee).
const PORTALS = [
  {
    title: "Employee Portal",
    role: "student",
    icon: User,
    description:
      "Your AI onboarding buddy: a personalised learning path, instant answers from company documents, and quizzes to confirm you've got it.",
    features: [
      "Ask questions any time, answered only from company documents with sources cited",
      "A Day 1 / Week 1 / Day 30 learning plan built around your role",
      "Short modules and quizzes with progress you can track",
      "Conversation history so you can pick up where you left off",
    ],
    cta: "Launch Employee Portal",
  },
  {
    title: "Manager Portal",
    role: "faculty",
    icon: Users,
    description:
      "Everything you need to onboard your team: upload documents, review quizzes, and see where each new hire stands.",
    features: [
      "Upload policies and training documents to build onboarding modules",
      "Review and approve generated quizzes before they go live",
      "Track each employee's progress, scores and readiness",
      "Get alerts when someone is stuck and see questions the documents can't answer",
    ],
    cta: "Launch Manager Portal",
  },
] as const

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30 flex flex-col">
      {/* Header */}
      <header className="w-full border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900">OnboardAI</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login?role=student">
              <Button variant="outline" size="sm" className="border-blue-200 hover:bg-blue-50">Employee Login</Button>
            </Link>
            <Link href="/login?role=faculty">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">Manager Login</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-6 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Welcome Section */}
          <div className="text-center mb-16">
            <h1 className="text-5xl font-bold text-gray-900 mb-4 tracking-tight">
              Welcome to OnboardAI
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
              An AI onboarding assistant that gets new hires productive faster and gives managers back their time.
            </p>
            <div className="w-20 h-1 bg-gradient-to-r from-blue-600 to-indigo-600 mx-auto mt-6 rounded-full"></div>
          </div>

          {/* Portal Cards */}
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {PORTALS.map(({ title, role, icon: Icon, description, features, cta }) => (
              <Card key={role} className="border border-gray-200 hover:border-blue-400 transition-all duration-300 hover:shadow-2xl group bg-white">
                <CardContent className="p-8 flex flex-col h-full">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg group-hover:shadow-xl transition-shadow">
                    <Icon className="h-8 w-8 text-white" />
                  </div>

                  <h2 className="text-3xl font-bold text-gray-900 mb-3 tracking-tight">{title}</h2>

                  <p className="text-gray-600 mb-6 text-base leading-relaxed">{description}</p>

                  <ul className="space-y-3 mb-8 flex-1">
                    {features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-700 text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link href={`/login?role=${role}`} className="mt-auto">
                    <Button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-base font-semibold py-6 rounded-xl shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]">
                      {cta}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
