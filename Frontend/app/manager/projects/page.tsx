"use client"

// Manager › Projects: connect repositories employees can explore and learn from, and see what's indexed.
import { useEffect, useState } from "react"
import { GitBranch, GitCommit } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AddRepoForm } from "@/components/projects/AddRepoForm"
import { api, type Project, type Team } from "@/src/lib/api"

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [teams, setTeams] = useState<Team[]>([])

  const load = () => {
    api.projects().then(setProjects).catch(() => setProjects([]))
    api.teams().then(setTeams).catch(() => setTeams([]))
  }
  useEffect(() => {
    load()
  }, [])

  const teamsOf = (pid: string) => teams.filter((t) => t.project_ids.includes(pid)).map((t) => t.name)

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-blue-600" /> Add a repository
          </CardTitle>
          <CardDescription>Your employees can browse it, ask about it in chat, and learn from it.</CardDescription>
        </CardHeader>
        <CardContent>
          <AddRepoForm teams={teams} onAdded={load} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected repositories</CardTitle>
          <CardDescription>{projects.length} connected</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {projects.length === 0 && <p className="text-sm text-gray-600">No repositories yet.</p>}
          {projects.map((p) => (
            <div key={p.id} className="rounded-lg border bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-gray-900">
                  {p.name} <span className="font-normal text-gray-500">· {p.branch}</span>
                </div>
                <div className="flex gap-1.5">
                  <Badge variant="outline">{p.file_count ?? 0} files</Badge>
                  <Badge variant="outline">{p.chunk_count ?? 0} chunks</Badge>
                </div>
              </div>
              <div className="mt-1 truncate font-mono text-xs text-gray-500">{p.git_url || p.local_path}</div>
              {p.last_commit && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-600">
                  <GitCommit className="h-3.5 w-3.5" /> {p.last_commit.sha.slice(0, 8)} {p.last_commit.message}
                  <span className="text-gray-400">· synced {p.last_synced ? new Date(p.last_synced).toLocaleString() : "-"}</span>
                </div>
              )}
              <div className="mt-1 text-xs text-gray-600">Teams: {teamsOf(p.id).join(", ") || "none yet"}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
