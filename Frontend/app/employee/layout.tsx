import { AppShell } from "@/components/shell/AppShell"

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
