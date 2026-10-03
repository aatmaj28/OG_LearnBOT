"use client"

// The signed-in user (from the login page's session). For employees, employeeId is their own id; for
// managers it falls back to DEMO_EMPLOYEE_ID so shared pages keep working.
import { createContext, useContext, useEffect, useState } from "react"
import { DEMO_EMPLOYEE_ID } from "@/src/lib/api"
import { getSession, type SessionUser } from "@/src/lib/session"

type EmployeeContextValue = {
  user: SessionUser | null
  employeeId: string
  employee: { id: string; name: string; role: string } | undefined
  ready: boolean
}

const EmployeeContext = createContext<EmployeeContextValue>({
  user: null,
  employeeId: DEMO_EMPLOYEE_ID,
  employee: undefined,
  ready: false,
})

export function EmployeeProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setUser(getSession()?.user ?? null)
    setReady(true)
  }, [])

  const employeeId = user?.employee_id ?? DEMO_EMPLOYEE_ID
  const employee = user ? { id: employeeId, name: user.name, role: user.title ?? "" } : undefined
  return <EmployeeContext.Provider value={{ user, employeeId, employee, ready }}>{children}</EmployeeContext.Provider>
}

export const useEmployee = () => useContext(EmployeeContext)
