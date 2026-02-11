"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FileText, FolderOpen, Users, Calendar, Download, ExternalLink } from "lucide-react"
import type { Class } from "@/lib/types"
import { toast } from "sonner"

interface StudentClassesTabProps {
  isDarkMode?: boolean
}

export function StudentClassesTab({ isDarkMode = false }: StudentClassesTabProps) {
  const [classes, setClasses] = useState<Class[]>([])
  const [selectedClass, setSelectedClass] = useState<Class | null>(null)
  const [activeView, setActiveView] = useState<"assignments" | "resources">("assignments")
  const [assignments, setAssignments] = useState<Array<{ id: string; name: string; pdfUrl?: string; dueDate: string; canvasLink: string; createdAt: Date | string }>>([])
  const [resources, setResources] = useState<Array<{ name: string; size: number; uploadedAt: Date | string }>>([])
  const [showResourcePreviewDialog, setShowResourcePreviewDialog] = useState(false)
  const [previewResourceIndex, setPreviewResourceIndex] = useState<number | null>(null)
  const [previewResourceBlobUrl, setPreviewResourceBlobUrl] = useState<string | null>(null)
  const [isDownloadingResource, setIsDownloadingResource] = useState(false)

  useEffect(() => {
    loadClasses()
  }, [])

  useEffect(() => {
    if (selectedClass) {
      setActiveView("assignments")
    }
  }, [selectedClass])

  useEffect(() => {
    if (selectedClass && activeView === "assignments") {
      loadAssignments()
    }
  }, [selectedClass, activeView])

  useEffect(() => {
    if (selectedClass && activeView === "resources") {
      loadResources()
    }
  }, [selectedClass, activeView])

  const loadClasses = async () => {
    const studentId = localStorage.getItem("userId")
    if (!studentId) return
    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      const data = await classesApi.getClasses(undefined, studentId)
      setClasses(data.classes || [])
    } catch (error) {
      console.error("[Student] Failed to load classes:", error)
      setClasses([])
    }
  }

  const loadAssignments = async () => {
    if (!selectedClass) return
    const userId = localStorage.getItem("userId")
    if (!userId) return
    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      const data = await classesApi.getAssignments(selectedClass.id, userId)
      setAssignments(data.assignments || [])
    } catch (error) {
      console.error("[Student] Failed to load assignments:", error)
      setAssignments([])
    }
  }

  const loadResources = async () => {
    if (!selectedClass) return
    const userId = localStorage.getItem("userId")
    if (!userId) return
    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      const data = await classesApi.getResources(selectedClass.id, userId)
      setResources(data.resources || [])
    } catch (error) {
      console.error("[Student] Failed to load resources:", error)
      setResources([])
    }
  }

  const downloadAssignment = async (assignmentId: string, assignmentName: string) => {
    if (!selectedClass) return
    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      const blob = await classesApi.downloadAssignment(selectedClass.id, assignmentId)
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
      console.error("[Student] Failed to download assignment:", error)
      toast.error("Failed to download assignment")
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
    if (!selectedClass || !resources[index]) return
    setPreviewResourceIndex(index)
    setShowResourcePreviewDialog(true)
    setPreviewResourceBlobUrl(null)
    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      const blob = await classesApi.downloadResource(selectedClass.id, resources[index].name)
      const blobUrl = URL.createObjectURL(blob)
      setPreviewResourceBlobUrl(blobUrl)
    } catch (error) {
      console.error("[Student] Failed to load resource for preview:", error)
      toast.error("Failed to load preview")
    }
  }

  const downloadResource = async (fileName: string) => {
    if (!selectedClass || isDownloadingResource) return
    setIsDownloadingResource(true)
    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      const blob = await classesApi.downloadResource(selectedClass.id, fileName)
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
      console.error("[Student] Failed to download resource:", error)
      toast.error("Failed to download")
    } finally {
      setIsDownloadingResource(false)
    }
  }

  return (
    <div className="h-full flex">
      {/* Left: My Classes */}
      <div className={`w-96 border-r shadow-sm p-4 flex-shrink-0 ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white"}`}>
        <h2 className={`font-semibold mb-4 ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}>My Classes</h2>
        <ScrollArea className="h-[calc(100vh-180px)]">
          <div className="space-y-2">
            {classes.length === 0 ? (
              <p className={`text-sm text-center py-8 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                You are not enrolled in any classes yet.
              </p>
            ) : (
              classes.map((classItem) => (
                <Card
                  key={classItem.id}
                  className={`p-3 cursor-pointer transition-colors ${
                    selectedClass?.id === classItem.id
                      ? isDarkMode
                        ? "bg-blue-900/30 border-blue-600"
                        : "bg-blue-50 border-blue-200"
                      : isDarkMode
                        ? "bg-gray-800 border-gray-700 hover:bg-gray-750"
                        : "hover:bg-gray-50"
                  }`}
                  onClick={() => setSelectedClass(classItem)}
                >
                  <p className={`font-medium text-sm ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}>
                    {classItem.name}
                  </p>
                  <p className={`text-xs mt-1 line-clamp-2 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                    {classItem.description}
                  </p>
                  <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    <span>Class</span>
                  </div>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right: Class detail - Assignments & Resources */}
      <div className="flex-1 p-6 overflow-auto">
        {!selectedClass ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md">
              <div
                className={`p-4 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center shadow-lg ${
                  isDarkMode ? "bg-gradient-to-br from-blue-900 to-indigo-900" : "bg-gradient-to-br from-blue-100 to-indigo-100"
                }`}
              >
                <FolderOpen className={`h-10 w-10 ${isDarkMode ? "text-blue-400" : "text-blue-600"}`} />
              </div>
              <h2 className={`text-2xl font-bold mb-3 ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}>
                Select a Class
              </h2>
              <p className={isDarkMode ? "text-gray-400" : "text-gray-600"}>
                Choose a class from the list to view assignments and resources
              </p>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-6">
              <h2 className={`text-2xl font-bold mb-2 ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}>
                {selectedClass.name}
              </h2>
              <p className={isDarkMode ? "text-gray-400" : "text-gray-600"}>{selectedClass.description}</p>

              {/* Tab bar: Assignments | Resources (like faculty portal) */}
              <Tabs value={activeView} onValueChange={(v) => setActiveView(v as "assignments" | "resources")} className="mt-4">
                <TabsList className={`h-10 ${isDarkMode ? "bg-gray-800 border border-gray-700" : "bg-gray-100"}`}>
                  <TabsTrigger
                    value="assignments"
                    className={`gap-2 ${isDarkMode ? "data-[state=active]:bg-blue-900/50 data-[state=active]:text-blue-300" : "data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm"}`}
                  >
                    <FileText className="h-4 w-4" />
                    Assignments
                  </TabsTrigger>
                  <TabsTrigger
                    value="resources"
                    className={`gap-2 ${isDarkMode ? "data-[state=active]:bg-blue-900/50 data-[state=active]:text-blue-300" : "data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm"}`}
                  >
                    <FolderOpen className="h-4 w-4" />
                    Resources
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="assignments" className="mt-4 m-0">
              <Card className={isDarkMode ? "bg-gray-800 border-gray-700" : ""}>
                <CardHeader>
                  <CardTitle className={isDarkMode ? "text-gray-100" : ""}>Assignments</CardTitle>
                  <CardDescription className={isDarkMode ? "text-gray-400" : ""}>
                    View and download assignments for {selectedClass.name}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {assignments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <FileText className={`mx-auto h-12 w-12 mb-4 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`} />
                      <p className={`text-sm font-medium mb-2 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                        No assignments yet
                      </p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[calc(100vh-320px)]">
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
                              <Button
                                variant="outline"
                                size="sm"
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
                                  Open in Canvas
                                </Button>
                              )}
                            </div>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
                </TabsContent>

                <TabsContent value="resources" className="mt-4 m-0">
              <Card className={isDarkMode ? "bg-gray-800 border-gray-700" : ""}>
                <CardHeader>
                  <CardTitle className={isDarkMode ? "text-gray-100" : ""}>Resources</CardTitle>
                  <CardDescription className={isDarkMode ? "text-gray-400" : ""}>
                    View and download resources for {selectedClass.name}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {resources.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <FolderOpen className={`mx-auto h-12 w-12 mb-4 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`} />
                      <p className={`text-sm font-medium mb-2 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                        No resources yet
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
                            className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                            onClick={() => openResourcePreview(index)}
                          >
                            <FileText className={`h-5 w-5 flex-shrink-0 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`} />
                            <div className="flex-1 min-w-0">
                              <p className={`font-medium text-sm truncate ${isDarkMode ? "text-gray-200" : "text-gray-900"}`}>
                                {resource.name}
                              </p>
                              <p className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                                {formatFileSize(resource.size)} • {new Date(resource.uploadedAt).toLocaleDateString()}
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
                            disabled={isDownloadingResource}
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
                </TabsContent>
              </Tabs>
          </div>
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
              <DialogTitle className="text-lg">
                {resources[previewResourceIndex].name}
              </DialogTitle>
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
