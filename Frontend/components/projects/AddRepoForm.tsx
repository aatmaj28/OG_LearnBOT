"use client"

// Connect a repository (git URL or local path) for employees to explore and learn from. The backend clones it
// (git clone --depth 1), indexes code + docs, and optionally attaches it to one of the manager's teams.
import { useState } from "react"
import { GitBranch, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, type Project, type Team } from "@/src/lib/api"

export function AddRepoForm({ teams, defaultTeamId, onAdded }: {
  teams: Team[]
  defaultTeamId?: string
  onAdded: (p: Project) => void
}) {
  const [name, setName] = useState("")
  const [source, setSource] = useState("")
  const [branch, setBranch] = useState("main")
  const [token, setToken] = useState("")
  const [teamId, setTeamId] = useState(defaultTeamId ?? teams[0]?.id ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const isUrl = /^(https?:\/\/|git@|ssh:\/\/)/.test(source.trim())
    try {
      const p = await api.createProject({
        name: name.trim() || source.trim().split("/").pop()?.replace(/\.git$/, "") || "Project",
        ...(isUrl ? { git_url: source.trim() } : { local_path: source.trim() }),
        branch: branch.trim() || "main",
        token: token.trim() || undefined,
        team_id: teamId || undefined,
      })
      toast.success(`${p.name} connected: ${p.file_count} files, ${p.chunk_count} chunks indexed`)
      setName("")
      setSource("")
      setToken("")
      onAdded(p)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="repo-src">Repository (git URL or local path)</Label>
          <Input id="repo-src" required value={source} onChange={(e) => setSource(e.target.value)}
                 placeholder="https://github.com/org/service.git" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="repo-name">Name</Label>
          <Input id="repo-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Payments service" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="repo-branch">Branch</Label>
          <Input id="repo-branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="repo-token">Access token (private repos, optional)</Label>
          <Input id="repo-token" type="password" value={token} onChange={(e) => setToken(e.target.value)}
                 placeholder="Used only to clone; never stored" />
        </div>
        {teams.length > 0 && (
          <div className="space-y-1">
            <Label htmlFor="repo-team">Give access to team</Label>
            <select id="repo-team" value={teamId} onChange={(e) => setTeamId(e.target.value)}
                    className="h-9 w-full rounded-md border bg-white px-2 text-sm">
              <option value="">No team (assign later)</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy || !source.trim()}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
        {busy ? "Cloning and indexing…" : "Connect repository"}
      </Button>
      <p className="flex items-center gap-1.5 text-xs text-gray-500">
        <GitBranch className="h-3.5 w-3.5" /> Cloned with --depth 1, then code and docs are indexed for chat and Learn.
      </p>
    </form>
  )
}
