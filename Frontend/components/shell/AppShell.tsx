"use client"

// App shell for the new LearnBOT sections (employee, manager, team): header, grouped navigation and the
// employee switcher. Each section's layout.tsx wraps its pages in <AppShell>.
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3, Bot, FolderTree, GitBranch, GraduationCap, MessageSquare, Smile, UserRound, Users,
} from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmployeeProvider, useEmployee } from "./employee-context"

const NAV = [
  {
    group: "Employee",
    links: [
      { href: "/employee/chat", label: "Chat", icon: MessageSquare },
      { href: "/employee/files", label: "Files", icon: FolderTree },
      { href: "/employee/learn", label: "Learn", icon: GraduationCap },
      { href: "/employee/experience", label: "Experience", icon: Smile },
    ],
  },
  {
    group: "Manager",
    links: [
      { href: "/manager", label: "Dashboard", icon: BarChart3 },
      { href: "/manager/projects", label: "Projects", icon: GitBranch },
    ],
  },
  { group: "Team", links: [{ href: "/team/meetings", label: "Meetings", icon: Users }] },
]

function isActive(pathname: string, href: string) {
  const p = pathname.replace(/\/+$/, "") || "/"
  return p === href || (href !== "/manager" && p.startsWith(`${href}/`))
}

function EmployeeSwitcher() {
  const { employeeId, setEmployeeId, employees } = useEmployee()
  return (
    <div className="flex items-center gap-2">
      <UserRound className="h-4 w-4 text-gray-500" />
      <Select value={employeeId} onValueChange={setEmployeeId}>
        <SelectTrigger className="h-9 w-[240px] bg-white" aria-label="Act as employee">
          <SelectValue placeholder="Choose an employee" />
        </SelectTrigger>
        <SelectContent>
          {(employees.length ? employees : [{ id: employeeId, name: employeeId, role: "" }]).map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.name}
              {e.role ? <span className="text-gray-500"> · {e.role}</span> : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ""
  return (
    <EmployeeProvider>
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-gray-50 to-blue-50/20">
        <header className="sticky top-0 z-30 border-b bg-white/80 shadow-sm backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link href="/employee/chat" className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 shadow-md">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="font-semibold text-gray-900">LearnBOT</h1>
                <p className="text-sm text-gray-600">Onboarding assistant · runs locally on the GB10</p>
              </div>
            </Link>
            <EmployeeSwitcher />
          </div>
          <nav className="flex gap-6 overflow-x-auto border-t bg-white px-4" aria-label="Main">
            {NAV.map(({ group, links }) => (
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
    </EmployeeProvider>
  )
}
