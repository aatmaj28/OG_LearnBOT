"use client"

// Manager › Teams: the signed-in manager's teams, each team's projects, and the context the manager has added
// for every project (with a form to add more: paste notes or upload text files).
import { useEffect, useState } from "react"
import { FileText, FolderGit2, Link2, Loader2, Plus, Upload, Users } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AddRepoForm } from "@/components/projects/AddRepoForm"
import { api, type Project, type Team, type TeamProject } from "@/src/lib/api"

function AddContext({ project, onAdded }: { project: TeamProject; onAdded: () => void }) {
  const [title, setTitle] = useState("")
  const [text, setText] = useState("")
  const [files, setFiles] = useState<FileList | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const form = new FormData()
    form.set("title", title)
    form.set("text", text)
    for (const f of Array.from(files ?? [])) form.append("files", f)
    setBusy(true)
    try {
      const r = await api.addContext(project.id, form)
      toast.success(`Added ${r.saved.join(", ")} to ${project.name}`)
      setTitle("")
      setText("")
      setFiles(null)
      ;(e.target as HTMLFormElement).reset()
      onAdded()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-md border border-dashed bg-gray-50/60 p-3">
      <p className="text-xs font-medium text-gray-700">Add context for {project.name}</p>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. Deployment checklist" />
      <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-24 text-sm"
                placeholder="Notes new hires should know: conventions, who owns what, how to deploy…" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-blue-700 hover:underline">
          <Upload className="h-3.5 w-3.5" /> {files?.length ? `${files.length} file(s) selected` : "Upload text files (.md, .txt, …)"}
          <input type="file" multiple accept=".md,.txt,.rst,.json,.yaml,.yml,.csv,.py,.ts,.tsx,.js,.sql,.sh"
                 className="hidden" onChange={(e) => setFiles(e.target.files)} />
        </label>
        <Button type="submit" size="sm" disabled={busy || (!text.trim() && !files?.length)}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
          Add context
        </Button>
      </div>
    </form>
  )
}

function ProjectBlock({ project, onChange, onOpen }: {
  project: TeamProject
  onChange: () => void
  onOpen: (projectId: string, name: string) => void
}) {
  return (
    <div className="space-y-3 rounded-lg border bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium text-gray-900">
          <FolderGit2 className="h-4 w-4 text-indigo-600" /> {project.name}
          <span className="text-sm font-normal text-gray-500">· {project.branch}</span>
        </div>
        <div className="flex gap-1.5">
          <Badge variant="outline">{project.file_count ?? 0} files</Badge>
          <Badge variant="outline">{project.context.length} context docs</Badge>
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Context from you</p>
        {project.context.length === 0 ? (
          <p className="text-sm text-gray-500">No context yet. Add what new hires should know about this project.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {project.context.map((c) => (
              <button key={c.name} onClick={() => onOpen(project.id, c.name)}
                      className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100">
                <FileText className="h-3.5 w-3.5" /> {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <AddContext project={project} onAdded={onChange} />
    </div>
  )
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[] | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<{ name: string; text: string } | null>(null)
  const [addingTo, setAddingTo] = useState<string | null>(null)

  const load = () => {
    api.teams().then(setTeams).catch((e) => setError(e instanceof Error ? e.message : String(e)))
    api.projects().then(setProjects).catch(() => {})
  }
  useEffect(() => {
    load()
  }, [])

  const open = (pid: string, name: string) => api.readContext(pid, name).then(setViewing).catch((e) => toast.error(String(e)))
  const attach = (teamId: string, pid: string) =>
    api.attachProject(teamId, pid).then(load).catch((e) => toast.error(e instanceof Error ? e.message : String(e)))

  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>
  if (!teams) return <p className="flex items-center gap-2 p-6 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading teams…</p>

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
      {teams.map((t) => {
        const attachable = projects.filter((p) => !t.project_ids.includes(p.id))
        return (
          <Card key={t.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" /> {t.name}
              </CardTitle>
              <CardDescription>{t.description}</CardDescription>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {t.members.map((m) => (
                  <Badge key={m.id} variant="secondary" title={m.role}>{m.name}</Badge>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {t.projects.length === 0 && <p className="text-sm text-gray-500">No projects for this team yet.</p>}
              {t.projects.map((p) => (
                <ProjectBlock key={p.id} project={p} onChange={load} onOpen={open} />
              ))}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {attachable.length > 0 && (
                  <select defaultValue="" onChange={(e) => e.target.value && attach(t.id, e.target.value)}
                          className="h-9 rounded-md border bg-white px-2 text-sm" aria-label="Attach an existing project">
                    <option value="">Attach an existing project…</option>
                    {attachable.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
                <Button variant="outline" size="sm" onClick={() => setAddingTo(addingTo === t.id ? null : t.id)}>
                  <Link2 className="mr-1.5 h-4 w-4" /> Add a repository to {t.name}
                </Button>
              </div>
              {addingTo === t.id && (
                <div className="rounded-lg border bg-white p-3">
                  <AddRepoForm teams={teams} defaultTeamId={t.id} onAdded={() => { setAddingTo(null); load() }} />
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">{viewing?.name}</DialogTitle>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm">{viewing?.text}</pre>
        </DialogContent>
      </Dialog>
    </div>
  )
}
