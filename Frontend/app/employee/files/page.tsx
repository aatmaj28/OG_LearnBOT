"use client"

// Project files (P1): the repositories your teams can use, as a file list + viewer.
import { useEffect, useState } from "react"
import { FolderTree } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api, type FileContent, type Project } from "@/src/lib/api"

export default function FilesPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<string>("")
  const [files, setFiles] = useState<string[]>([])
  const [filter, setFilter] = useState("")
  const [file, setFile] = useState<FileContent | null>(null)

  useEffect(() => {
    api
      .myTeams()
      .then((teams) => {
        const seen = new Map<string, Project>()
        teams.forEach((t) => t.projects.forEach((p) => seen.set(p.id, p)))
        const list = [...seen.values()]
        setProjects(list)
        if (list.length) setProjectId(list[0].id)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!projectId) return
    setFile(null)
    api.files(projectId).then(setFiles).catch(() => setFiles([]))
  }, [projectId])

  const shown = files.filter((f) => f.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 p-4 md:grid-cols-[320px_1fr] md:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-blue-600" /> Files
          </CardTitle>
          <CardDescription>{projects.length ? `${files.length} files` : "No repositories assigned to your teams yet"}</CardDescription>
          {projects.length > 0 && (
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
                    className="mt-2 h-9 w-full rounded-md border bg-white px-2 text-sm" aria-label="Repository">
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.branch})</option>
              ))}
            </select>
          )}
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter files…"
                 className="mt-2 h-9 w-full rounded-md border px-2 text-sm" />
        </CardHeader>
        <CardContent className="max-h-[65vh] space-y-0.5 overflow-auto text-sm">
          {shown.map((f) => (
            <button key={f} className={`block w-full truncate rounded px-1 text-left font-mono text-xs hover:bg-blue-50 ${file?.path === f ? "bg-blue-50 text-blue-700" : ""}`}
                    onClick={() => api.fileContent(f, projectId).then(setFile)}>
              {f}
            </button>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="truncate font-mono text-base">{file?.path ?? "Select a file"}</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[70vh] overflow-auto text-xs leading-relaxed">
            {file?.text.split("\n").map((line, i) => (
              <div key={i}>
                <span className="mr-3 inline-block w-10 select-none text-right text-gray-400">{i + 1}</span>
                {line}
              </div>
            ))}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}
