"use client"

// The employee the app is acting as (no login in the new app): chosen in the header switcher, remembered in
// localStorage, defaulting to DEMO_EMPLOYEE_ID (emp_demo).
import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { api, DEMO_EMPLOYEE_ID, type Employee } from "@/src/lib/api"

const STORAGE_KEY = "learnbot.employee_id"

type EmployeeContextValue = {
  employeeId: string
  setEmployeeId: (id: string) => void
  employees: Employee[]
  employee: Employee | undefined
}

const EmployeeContext = createContext<EmployeeContextValue>({
  employeeId: DEMO_EMPLOYEE_ID,
  setEmployeeId: () => {},
  employees: [],
  employee: undefined,
})

export function EmployeeProvider({ children }: { children: React.ReactNode }) {
  const [employeeId, setId] = useState(DEMO_EMPLOYEE_ID)
  const [employees, setEmployees] = useState<Employee[]>([])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setId(saved)
    } catch {}
    api.employees().then(setEmployees).catch(() => {})
  }, [])

  const setEmployeeId = useCallback((id: string) => {
    setId(id)
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {}
  }, [])

  const employee = employees.find((e) => e.id === employeeId)
  return (
    <EmployeeContext.Provider value={{ employeeId, setEmployeeId, employees, employee }}>
      {children}
    </EmployeeContext.Provider>
  )
}

export const useEmployee = () => useContext(EmployeeContext)
