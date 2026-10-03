import { AppShell } from "@/components/shell/AppShell"

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
