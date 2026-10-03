"use client"

// Project files (P1). Skeleton: list + plain viewer; the tree, line highlighting and project picker land on AJ.
import { useEffect, useState } from "react"
import { FolderTree } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api, type FileContent } from "@/src/lib/api"

export default function FilesPage() {
  const [files, setFiles] = useState<string[]>([])
  const [file, setFile] = useState<FileContent | null>(null)

  useEffect(() => {
    api.files().then(setFiles).catch(() => setFiles([]))
  }, [])

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 p-4 md:grid-cols-[280px_1fr] md:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-blue-600" /> Files
          </CardTitle>
          <CardDescription>{files.length} files</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {files.map((f) => (
            <button key={f} className="block w-full truncate text-left hover:underline" onClick={() => api.fileContent(f).then(setFile)}>
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
          <pre className="overflow-auto whitespace-pre text-xs">{file?.text}</pre>
        </CardContent>
      </Card>
    </div>
  )
}
