"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  FileText,
  FolderOpen,
  Calendar,
  Download,
  ExternalLink,
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  MessageSquare,
  Layers,
} from "lucide-react"
import type { Class } from "@/lib/types"
import { toast } from "sonner"

// What corpusApi.getFiles returns for a team. filesData carries the chunk count per file.
type CorpusFilesResponse = {
  files?: string[]
  totalChunks?: number
  filesData?: Array<{ fileName: string; chunkCount: number }>
}

type TeamView = "documents" | "assignments" | "resources"

interface EmployeeTeamDetailProps {
  team: Class
  isDarkMode?: boolean
  onBack: () => void
  // Hands the employee off to the chat, scoped to this team. An empty fileName means
  // "every document in the team" — the scope the chat already understands.
  onOpenDocument: (classId: string, fileName: string) => void
}

export function EmployeeTeamDetail({ team, isDarkMode = false, onBack, onOpenDocument }: EmployeeTeamDetailProps) {
  const [activeView, setActiveView] = useState<TeamView>("documents")

  const [documents, setDocuments] = useState<Array<{ fileName: string; chunkCount?: number }>>([])
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true)
  const [documentsError, setDocumentsError] = useState(false)

  const [assignments, setAssignments] = useState<Array<{ id: string; name: string; pdfUrl?: string; dueDate: string; canvasLink: string; createdAt: Date | string; fileExists?: boolean }>>([])
  const [resources, setResources] = useState<Array<{ name: string; size: number; uploadedAt: Date | string; fileExists?: boolean }>>([])

  const [showResourcePreviewDialog, setShowResourcePreviewDialog] = useState(false)
  const [previewResourceIndex, setPreviewResourceIndex] = useState<number | null>(null)
  const [previewResourceBlobUrl, setPreviewResourceBlobUrl] = useState<string | null>(null)
  const [isDownloadingResource, setIsDownloadingResource] = useState(false)

  // Documents are the point of the team, so load them up front whichever view is showing.
  useEffect(() => {
    let cancelled = false

    const loadDocuments = async () => {
      setIsLoadingDocuments(true)
      setDocumentsError(false)
      try {
        const { corpusApi } = await import("@/lib/flask-api-client")
        const data = (await corpusApi.getFiles(team.id, "class_material")) as CorpusFilesResponse
        if (cancelled) return
        const chunkByFile = new Map((data.filesData ?? []).map((f) => [f.fileName, f.chunkCount]))
        const fileNames = data.files ?? (data.filesData ?? []).map((f) => f.fileName)
        setDocuments(fileNames.map((fileName) => ({ fileName, chunkCount: chunkByFile.get(fileName) })))
      } catch (error) {
        console.error("[Employee] Failed to load team documents:", error)
        if (!cancelled) {
          setDocuments([])
          setDocumentsError(true)
        }
      } finally {
        if (!cancelled) setIsLoadingDocuments(false)
      }
    }

    loadDocuments()
    return () => {
      cancelled = true
    }
  }, [team.id])

  useEffect(() => {
    if (activeView !== "assignments") return
    let cancelled = false

    const loadAssignments = async () => {
      const userId = localStorage.getItem("userId")
      if (!userId) return
      try {
        const { classesApi } = await import("@/lib/flask-api-client")
        const data = (await classesApi.getAssignments(team.id, userId)) as { assignments?: typeof assignments }
        if (!cancelled) setAssignments(data.assignments || [])
      } catch (error) {
        console.error("[Employee] Failed to load assignments:", error)
        if (!cancelled) setAssignments([])
      }
    }

    loadAssignments()
    return () => {
      cancelled = true
    }
  }, [team.id, activeView])

  useEffect(() => {
    if (activeView !== "resources") return
    let cancelled = false

    const loadResources = async () => {
      const userId = localStorage.getItem("userId")
      if (!userId) return
      try {
        const { classesApi } = await import("@/lib/flask-api-client")
        const data = (await classesApi.getResources(team.id, userId)) as { resources?: typeof resources }
        if (!cancelled) setResources(data.resources || [])
      } catch (error) {
        console.error("[Employee] Failed to load resources:", error)
        if (!cancelled) setResources([])
      }
    }

    loadResources()
    return () => {
      cancelled = true
    }
  }, [team.id, activeView])

  const downloadAssignment = async (assignmentId: string, assignmentName: string) => {
    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      const blob = await classesApi.downloadAssignment(team.id, assignmentId)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = (assignmentName || "assignment").replace(/[^a-zA-Z0-9_.-]/g, "_") + ".pdf"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      toast.success("Download started")
    } catch (error) {
      console.error("[Employee] Failed to download assignment:", error)
      toast.error("Failed to download task")
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i]
  }

  const openResourcePreview = async (index: number) => {
    if (!resources[index]) return
    if (resources[index].fileExists === false) {
      toast.error("This file is missing from the server. Please contact your manager.")
      return
    }
    setPreviewResourceIndex(index)
    setShowResourcePreviewDialog(true)
    setPreviewResourceBlobUrl(null)
    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      const blob = await classesApi.downloadResource(team.id, resources[index].name)
      const blobUrl = URL.createObjectURL(blob)
      setPreviewResourceBlobUrl(blobUrl)
    } catch (error) {
      console.error("[Employee] Failed to load resource for preview:", error)
      toast.error("Failed to load preview")
    }
  }

  const downloadResource = async (fileName: string) => {
    if (isDownloadingResource) return
    setIsDownloadingResource(true)
    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      const blob = await classesApi.downloadResource(team.id, fileName)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      toast.success("Download started")
    } catch (error) {
      console.error("[Employee] Failed to download resource:", error)
      toast.error("Failed to download")
    } finally {
      setIsDownloadingResource(false)
    }
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-5xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className={`mb-4 gap-2 ${isDarkMode ? "text-gray-300 hover:bg-gray-700 hover:text-gray-100" : "text-gray-700 hover:bg-gray-100"}`}
        >
          <ArrowLeft className="h-4 w-4" />
          All Teams
        </Button>

        <div className="mb-6">
          <h2 className={`text-2xl font-bold mb-2 ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}>{team.name}</h2>
          {team.description && (
            <p className={isDarkMode ? "text-gray-400" : "text-gray-600"}>{team.description}</p>
          )}

          <div className="mt-4">
            <Select value={activeView} onValueChange={(v) => setActiveView(v as TeamView)}>
              <SelectTrigger className={`w-64 ${isDarkMode ? "bg-gray-700 border-gray-600 text-gray-100" : ""}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={isDarkMode ? "bg-gray-800 border-gray-700 text-gray-100" : ""}>
                <SelectItem value="documents" className={isDarkMode ? "focus:bg-gray-700 focus:text-gray-100" : ""}>
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    <span>Training Documents</span>
                  </div>
                </SelectItem>
                <SelectItem value="assignments" className={isDarkMode ? "focus:bg-gray-700 focus:text-gray-100" : ""}>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span>Onboarding Tasks</span>
                  </div>
                </SelectItem>
                <SelectItem value="resources" className={isDarkMode ? "focus:bg-gray-700 focus:text-gray-100" : ""}>
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4" />
                    <span>Reference Material</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {activeView === "documents" && (
          <Card className={isDarkMode ? "bg-gray-800 border-gray-700" : ""}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle className={isDarkMode ? "text-gray-100" : ""}>Training Documents</CardTitle>
                  <CardDescription className={isDarkMode ? "text-gray-400" : ""}>
                    Pick a document to start learning. LearnBOT answers only from what your manager uploaded to{" "}
                    {team.name}.
                  </CardDescription>
                </div>
                {documents.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => onOpenDocument(team.id, "")}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Chat across all documents
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingDocuments ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <BookOpen className={`h-12 w-12 mb-4 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`} />
                  <p className={`text-sm font-medium mb-1 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                    No documents in this team yet
                  </p>
                  <p className={`text-sm max-w-md ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                    {documentsError
                      ? "We couldn't load this team's documents just now. Try again in a moment."
                      : "Your manager hasn't uploaded any training documents to this team. Once they do, they'll appear here and you can start learning from them."}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <button
                      key={doc.fileName}
                      type="button"
                      onClick={() => onOpenDocument(team.id, doc.fileName)}
                      className={`w-full text-left flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors ${
                        isDarkMode
                          ? "bg-gray-800 border-gray-700 hover:bg-gray-700"
                          : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className={`h-5 w-5 flex-shrink-0 ${isDarkMode ? "text-blue-400" : "text-blue-600"}`} />
                        <div className="min-w-0">
                          <p className={`font-medium text-sm truncate ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}>
                            {doc.fileName}
                          </p>
                          {typeof doc.chunkCount === "number" && (
                            <p className={`text-xs flex items-center gap-1 mt-0.5 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                              <Layers className="h-3 w-3" />
                              {doc.chunkCount} {doc.chunkCount === 1 ? "chunk" : "chunks"} indexed
                            </p>
                          )}
                        </div>
                      </div>
                      <span
                        className={`flex items-center gap-1.5 text-sm font-medium flex-shrink-0 ${
                          isDarkMode ? "text-blue-400" : "text-blue-600"
                        }`}
                      >
                        <MessageSquare className="h-4 w-4" />
                        Start learning
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeView === "assignments" && (
          <Card className={isDarkMode ? "bg-gray-800 border-gray-700" : ""}>
            <CardHeader>
              <CardTitle className={isDarkMode ? "text-gray-100" : ""}>Onboarding Tasks</CardTitle>
              <CardDescription className={isDarkMode ? "text-gray-400" : ""}>
                View and download onboarding tasks for {team.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {assignments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <FileText className={`mx-auto h-12 w-12 mb-4 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`} />
                  <p className={`text-sm font-medium mb-2 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                    No tasks yet
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {assignments.map((assignment) => (
                    <Card
                      key={assignment.id}
                      className={`p-4 ${isDarkMode ? "bg-gray-800 border-gray-700 hover:bg-gray-750" : "bg-white border-gray-200 hover:bg-gray-50"}`}
                    >
                      <h3 className={`font-semibold text-lg mb-3 ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}>
                        {assignment.name}
                      </h3>
                      <div className="flex items-center gap-2 mb-4">
                        <Calendar className={`h-4 w-4 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`} />
                        <p className={`text-sm ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                          Due: {new Date(assignment.dueDate).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        {assignment.fileExists === false && (
                          <div className="flex items-center gap-2 mb-1 p-2 rounded bg-amber-500/10 border border-amber-500/30">
                            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                            <span className="text-xs text-amber-500">File unavailable — contact manager</span>
                          </div>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={assignment.fileExists === false}
                          onClick={() => downloadAssignment(assignment.id, assignment.name)}
                          className={isDarkMode ? "bg-gray-700 border-gray-600 text-gray-100 hover:bg-gray-600" : ""}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download PDF
                        </Button>
                        {assignment.canvasLink && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(assignment.canvasLink, "_blank")}
                            className={isDarkMode ? "bg-gray-700 border-gray-600 text-gray-100 hover:bg-gray-600" : ""}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Open Link
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeView === "resources" && (
          <Card className={isDarkMode ? "bg-gray-800 border-gray-700" : ""}>
            <CardHeader>
              <CardTitle className={isDarkMode ? "text-gray-100" : ""}>Reference Material</CardTitle>
              <CardDescription className={isDarkMode ? "text-gray-400" : ""}>
                View and download reference material for {team.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {resources.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <FolderOpen className={`mx-auto h-12 w-12 mb-4 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`} />
                  <p className={`text-sm font-medium mb-2 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                    No reference material yet
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {resources.map((resource, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        isDarkMode
                          ? "bg-gray-800 border-gray-700 hover:bg-gray-750"
                          : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      <div
                        className={`flex items-center gap-3 flex-1 min-w-0 ${resource.fileExists === false ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                        onClick={() => openResourcePreview(index)}
                      >
                        {resource.fileExists === false ? (
                          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-500" />
                        ) : (
                          <FileText className={`h-5 w-5 flex-shrink-0 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`} />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-sm truncate ${resource.fileExists === false ? "text-amber-500" : isDarkMode ? "text-gray-200" : "text-gray-900"}`}>
                            {resource.name}
                          </p>
                          <p className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                            {resource.fileExists === false ? (
                              <span className="text-amber-500">File unavailable — contact manager</span>
                            ) : (
                              <>
                                {formatFileSize(resource.size)} • {new Date(resource.uploadedAt).toLocaleDateString()}
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          downloadResource(resource.name)
                        }}
                        disabled={isDownloadingResource || resource.fileExists === false}
                        className={isDarkMode ? "bg-gray-700 border-gray-600 text-gray-100 hover:bg-gray-600" : ""}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Resource Preview Dialog */}
      {showResourcePreviewDialog && previewResourceIndex !== null && resources[previewResourceIndex] && (
        <Dialog
          open={showResourcePreviewDialog}
          onOpenChange={(open) => {
            if (!open) {
              if (previewResourceBlobUrl) {
                URL.revokeObjectURL(previewResourceBlobUrl)
                setPreviewResourceBlobUrl(null)
              }
              setShowResourcePreviewDialog(false)
              setPreviewResourceIndex(null)
            }
          }}
        >
          <DialogContent className="max-w-6xl w-[95vw] max-h-[95vh] h-[95vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-4 pb-3 flex-shrink-0">
              <DialogTitle className="text-lg">{resources[previewResourceIndex].name}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 flex flex-col min-h-0 px-6 overflow-hidden">
              <div
                className="flex-1 border rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900 min-h-0"
                style={{ height: "calc(95vh - 200px)" }}
              >
                {previewResourceBlobUrl && (
                  <iframe
                    src={previewResourceBlobUrl}
                    className="w-full h-full"
                    title={`Preview of ${resources[previewResourceIndex].name}`}
                    style={{ border: "none", minHeight: "600px" }}
                  />
                )}
                {!previewResourceBlobUrl && (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                  </div>
                )}
              </div>
              <div className="flex justify-end mt-3 pt-3 pb-4 border-t flex-shrink-0">
                <Button
                  onClick={() => downloadResource(resources[previewResourceIndex].name)}
                  disabled={isDownloadingResource}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
