"use client"

// Manager › Projects (P1). Skeleton: lists projects; connecting repos, sync and members land on AJ.
import { useEffect, useState } from "react"
import { GitBranch } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api, type Project } from "@/src/lib/api"

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    api.projects().then(setProjects).catch(() => setProjects([]))
  }, [])

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-blue-600" /> Projects
          </CardTitle>
          <CardDescription>Connected repositories employees can ask about.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {projects.length === 0 ? (
            <p className="text-gray-600">No projects connected yet.</p>
          ) : (
            <ul className="space-y-1">
              {projects.map((p) => (
                <li key={p.id}>
                  {p.name} <span className="text-gray-500">({p.branch})</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
