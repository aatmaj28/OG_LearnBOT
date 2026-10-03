"use client"

// App shell for the employee, manager and team sections: header, role-based navigation and the signed-in
// user. Pages need a session from the login page (/login?role=student|faculty); a user who opens the other
// role's portal is sent to their own.
import { useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  BarChart3, Bot, FolderTree, GitBranch, GraduationCap, Loader2, LogOut, MessageSquare, Smile, UserRound, Users,
  UsersRound,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { clearSession, portalHome } from "@/src/lib/session"
import { EmployeeProvider, useEmployee } from "./employee-context"

const NAV = {
  employee: [
    {
      group: "Employee",
      links: [
        { href: "/employee/chat", label: "Chat", icon: MessageSquare },
        { href: "/employee/files", label: "Files", icon: FolderTree },
        { href: "/employee/learn", label: "Learn", icon: GraduationCap },
        { href: "/employee/experience", label: "Experience", icon: Smile },
      ],
    },
    { group: "Team", links: [{ href: "/team/meetings", label: "Meetings", icon: Users }] },
  ],
  manager: [
    {
      group: "Manager",
      links: [
        { href: "/manager", label: "Dashboard", icon: BarChart3 },
        { href: "/manager/teams", label: "Teams", icon: UsersRound },
        { href: "/manager/projects", label: "Projects", icon: GitBranch },
      ],
    },
    { group: "Team", links: [{ href: "/team/meetings", label: "Meetings", icon: Users }] },
  ],
}

function isActive(pathname: string, href: string) {
  const p = pathname.replace(/\/+$/, "") || "/"
  return p === href || (href !== "/manager" && p.startsWith(`${href}/`))
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = (usePathname() ?? "").replace(/\/+$/, "")
  const router = useRouter()
  const { user, ready } = useEmployee()
  const section = pathname.startsWith("/manager") ? "manager" : pathname.startsWith("/employee") ? "employee" : "team"
  const wrongPortal = !!user && section !== "team" && section !== user.role

  useEffect(() => {
    if (!ready) return
    if (!user) router.replace(`/login?role=${section === "manager" ? "faculty" : "student"}`)
    else if (wrongPortal) router.replace(portalHome(user.role))
  }, [ready, user, wrongPortal, section, router])

  if (!ready || !user || wrongPortal) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50/20 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking your session…
      </div>
    )
  }

  const logout = () => {
    clearSession()
    router.replace("/")
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-gray-50 to-blue-50/20">
      <header className="sticky top-0 z-30 border-b bg-white/80 shadow-sm backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href={portalHome(user.role)} className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 shadow-md">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-gray-900">LearnBOT · {user.role === "manager" ? "Manager Portal" : "Employee Portal"}</h1>
              <p className="text-sm text-gray-600">Onboarding assistant · runs locally on the GB10</p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <UserRound className="h-4 w-4 text-gray-500" />
              <span className="font-medium text-gray-900">{user.name}</span>
              {user.title && <span className="text-gray-500">· {user.title}</span>}
            </div>
            <Button variant="ghost" size="sm" onClick={logout} className="gap-1.5">
              <LogOut className="h-4 w-4" /> Log out
            </Button>
          </div>
        </div>
        <nav className="flex gap-6 overflow-x-auto border-t bg-white px-4" aria-label="Main">
          {NAV[user.role].map(({ group, links }) => (
            <div key={group} className="flex items-center gap-1 py-1.5">
              <span className="mr-1 text-xs font-medium uppercase tracking-wide text-gray-400">{group}</span>
              {links.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href)
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      active ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <EmployeeProvider>
      <Shell>{children}</Shell>
    </EmployeeProvider>
  )
}
