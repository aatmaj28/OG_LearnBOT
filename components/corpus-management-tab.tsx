"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Upload, PlayCircle, FileText, Database, Trash2, BookOpen, Calendar, RefreshCw } from "lucide-react"
import type { Class } from "@/lib/types"
import { toast } from "sonner"

type MaterialType = "class_material" | "syllabus"

interface CorpusManagementTabProps {
  isDarkMode?: boolean
}

export function CorpusManagementTab({ isDarkMode = false }: CorpusManagementTabProps) {
  const [classes, setClasses] = useState<Class[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string>("")
  const [materialType, setMaterialType] = useState<MaterialType>("class_material")
  const [filesOnServer, setFilesOnServer] = useState<string[]>([])
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isIndexing, setIsIndexing] = useState(false)
  const [indexedPdfCount, setIndexedPdfCount] = useState(0)
  const [indexedChunkCount, setIndexedChunkCount] = useState(0)
  const [entireCorpusStats, setEntireCorpusStats] = useState<{ exists: boolean, totalChunks?: number, totalPdfs?: number } | null>(null)
  const [isBuildingEntireCorpus, setIsBuildingEntireCorpus] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    loadClasses()
  }, [])

  useEffect(() => {
    if (selectedClassId) {
      loadServerFiles()
      loadIndexStats()
    } else {
      setFilesOnServer([])
      setIndexedPdfCount(0)
      setIndexedChunkCount(0)
    }
  }, [selectedClassId, materialType])

  const loadClasses = async () => {
    const userId = localStorage.getItem("userId")
    if (!userId) return
    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      const data = await classesApi.getClasses(userId)
      setClasses(data.classes || [])
      if (data.classes && data.classes.length > 0) {
        setSelectedClassId(data.classes[0].id)
      }
    } catch (e) {
      console.error("Failed to load classes", e)
    }
  }

  const loadServerFiles = async () => {
    if (!selectedClassId) return
    try {
      const { corpusApi } = await import("@/lib/flask-api-client")
      const data = await corpusApi.getFiles(selectedClassId, materialType)
      setFilesOnServer(data.files || [])
    } catch (e) {
      console.error("Failed to load server files", e)
    }
  }

  const loadIndexStats = async () => {
    if (!selectedClassId) return
    try {
      // Get files and chunk stats from API
      const { corpusApi } = await import("@/lib/flask-api-client")
      const data = await corpusApi.getFiles(selectedClassId, materialType) as {
        files?: string[]
        filesData?: Array<{ chunkCount?: number }>
        totalChunks?: number
      }
      setIndexedPdfCount(data.files?.length || 0)
      // Use totalChunks from API response
      setIndexedChunkCount(data.totalChunks || 0)
    } catch (e) {
      console.error("Failed to load index stats", e)
    }
  }

  const deleteIndexedFile = async (filename: string) => {
    if (!selectedClassId) return
    if (!confirm(`Delete ${filename}?\n\nThis will remove the file and its embeddings from the index.`)) return
    try {
      const { corpusApi } = await import("@/lib/flask-api-client")
      await corpusApi.deleteFile(selectedClassId, filename, materialType)
      toast.success("File and embeddings removed")
      await loadServerFiles()
      await loadIndexStats()
    } catch (e) {
      console.error("Delete error", e)
      toast.error("Delete error")
    }
  }

  const onPickFiles = () => {
    fileInputRef.current?.click()
  }

  // Supported file types for corpus indexing
  const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt']
  const ACCEPT_STRING = '.pdf,.docx,.doc,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain'

  const onFilesChosen: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const files = Array.from(e.target.files || [])
    const supported = files.filter(f => {
      const name = f.name.toLowerCase()
      return SUPPORTED_EXTENSIONS.some(ext => name.endsWith(ext))
    })
    setSelectedFiles(prev => [...prev, ...supported])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const onStartIndex = async () => {
    if (!selectedClassId || selectedFiles.length === 0) return

    setIsIndexing(true)
    setIsUploading(true)

    try {
      // Step 1: Upload files (PDF, Word, TXT)
      const materialLabel = materialType === "syllabus" ? "Syllabus/Schedule" : "Class Material"
      toast.info(`Uploading ${selectedFiles.length} ${materialLabel} file(s)...`)
      const { corpusApi } = await import("@/lib/flask-api-client")
      await corpusApi.upload(selectedClassId, selectedFiles, materialType)

      toast.success("Files uploaded. Starting indexing...")

      // Step 2: Index all files (including newly uploaded ones)
      const indexData = await corpusApi.index(selectedClassId, materialType)

      if (indexData.success) {
        toast.success("Files indexed successfully")
        // Update stats from response
        if (indexData.pdfs !== undefined) {
          setIndexedPdfCount(indexData.pdfs)
        }
        if (indexData.chunks !== undefined) {
          setIndexedChunkCount(indexData.chunks)
        }
        setSelectedFiles([]) // Clear selected files after successful indexing
        await loadServerFiles() // Reload to show all indexed files
        await loadIndexStats()
      } else {
        toast.error("Indexing failed")
      }
    } catch (e) {
      console.error("Index error", e)
      toast.error("Process failed")
    } finally {
      setIsIndexing(false)
      setIsUploading(false)
    }
  }

  const onForceReindex = async () => {
    if (!selectedClassId) return
    if (!confirm("Force Re-index will delete all existing chunks and re-process all files from scratch.\n\nThis is useful if the indexed data seems corrupted or incomplete.\n\nContinue?")) return

    setIsIndexing(true)
    try {
      const { corpusApi } = await import("@/lib/flask-api-client")
      toast.info("Force re-indexing all files from scratch...")
      const indexData = await corpusApi.index(selectedClassId, materialType, true)
      if (indexData.success) {
        toast.success(`Re-indexed successfully: ${indexData.chunks} chunks from ${indexData.pdfs} file(s)`)
        if (indexData.pdfs !== undefined) setIndexedPdfCount(indexData.pdfs)
        if (indexData.chunks !== undefined) setIndexedChunkCount(indexData.chunks)
        await loadServerFiles()
        await loadIndexStats()
      } else {
        toast.error("Force re-index failed")
      }
    } catch (e) {
      console.error("Force reindex error", e)
      toast.error("Force re-index failed")
    } finally {
      setIsIndexing(false)
    }
  }

  const removeSelectedFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="h-full flex flex-col p-4 gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-md">
            <Database className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className={`font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Corpus Management</h2>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Upload documents (PDF, Word, TXT) and build vector index for different content types</p>
          </div>
        </div>
        {selectedClassId && (
          <div className="flex gap-4 items-center bg-indigo-50 dark:bg-indigo-950 px-4 py-2 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold text-indigo-600">{indexedPdfCount}</div>
              <div className="text-xs text-muted-foreground">Files Indexed</div>
            </div>
            <div className="h-8 w-px bg-indigo-200"></div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{indexedChunkCount}</div>
              <div className="text-xs text-muted-foreground">Chunks</div>
            </div>
          </div>
        )}
      </div>

      <Tabs value={materialType} onValueChange={(val) => {
        setMaterialType(val as MaterialType)
        setSelectedFiles([]) // Clear selected files when switching tabs
      }} className="flex-1">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="class_material" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Class Material
          </TabsTrigger>
          <TabsTrigger value="syllabus" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Syllabus/Schedule
          </TabsTrigger>
        </TabsList>

        <TabsContent value="class_material" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-4 col-span-1">
              <div className="space-y-3">
                <label className="text-sm font-medium">Select Class</label>
                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a class..." />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="pt-2 space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT_STRING}
                    multiple
                    className="hidden"
                    onChange={onFilesChosen}
                  />
                  <Button variant="outline" onClick={onPickFiles} disabled={!selectedClassId || isIndexing} className="w-full border-blue-300 text-blue-700 hover:bg-blue-50">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Files
                  </Button>

                  {selectedFiles.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium">Selected Files ({selectedFiles.length}):</div>
                      <div className="max-h-[150px] overflow-y-auto space-y-1">
                        {selectedFiles.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2 text-xs bg-muted px-2 py-1 rounded">
                            <span className="truncate flex-1">{file.name}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 w-5 p-0 hover:bg-red-100 hover:text-red-600"
                              onClick={() => removeSelectedFile(idx)}
                              disabled={isIndexing}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      <Button
                        onClick={onStartIndex}
                        disabled={!selectedClassId || isIndexing || selectedFiles.length === 0}
                        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md"
                      >
                        <PlayCircle className="h-4 w-4 mr-2" />
                        {isIndexing ? "Processing..." : `Start Index (${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''})`}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <Card className="p-4 col-span-1 lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">Indexed Files in Corpus ({filesOnServer.length})</h3>
                {selectedClassId && filesOnServer.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                    onClick={onForceReindex}
                    disabled={isIndexing}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Force Re-index
                  </Button>
                )}
              </div>
              {!selectedClassId ? (
                <div className="text-sm text-muted-foreground">Select a class</div>
              ) : filesOnServer.length === 0 ? (
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">No files indexed yet. Upload and index documents to get started.</div>
                  {indexedChunkCount > 0 && (
                    <div className="pt-2 border-t">
                      <div className="text-xs text-muted-foreground mb-2">
                        Found {indexedChunkCount} orphaned chunk{indexedChunkCount !== 1 ? 's' : ''} from previous indexing.
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full border-orange-300 text-orange-700 hover:bg-orange-50"
                        onClick={async () => {
                          if (!confirm(`Clear all ${indexedChunkCount} chunks? This will remove all indexed data but keep uploaded PDFs.`)) return
                          try {
                            // Trigger clear-all by trying to delete a dummy file
                            const res = await fetch(`/api/corpus/files?classId=${selectedClassId}&filename=__clear_all_chunks__.pdf&materialType=${materialType}`, {
                              method: "DELETE"
                            })
                            const data = await res.json()
                            if (res.ok && data.success) {
                              toast.success(data.message || "All chunks cleared")
                              // Update stats immediately from response
                              if (data.pdfCount !== undefined) {
                                setIndexedPdfCount(data.pdfCount)
                              }
                              if (data.chunkCount !== undefined) {
                                setIndexedChunkCount(data.chunkCount)
                              }
                              await loadIndexStats()
                            } else {
                              const errorMsg = data.error || data.message || "Failed to clear chunks"
                              toast.error(errorMsg)
                              console.error("Clear chunks failed:", data)
                            }
                          } catch (e) {
                            console.error("Clear chunks error", e)
                            toast.error("Clear chunks error")
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3 mr-2" />
                        Clear All Chunks ({indexedChunkCount})
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <ScrollArea className="h-[360px]">
                  <div className="space-y-2">
                    {filesOnServer.map((f, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 text-sm bg-muted px-3 py-2 rounded hover:bg-muted/80">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <FileText className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{f}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 hover:bg-red-100 hover:text-red-600"
                          onClick={() => deleteIndexedFile(f)}
                          disabled={isIndexing}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="syllabus" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-4 col-span-1">
              <div className="space-y-3">
                <label className="text-sm font-medium">Select Class</label>
                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a class..." />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="pt-2 space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT_STRING}
                    multiple
                    className="hidden"
                    onChange={onFilesChosen}
                  />
                  <Button variant="outline" onClick={onPickFiles} disabled={!selectedClassId || isIndexing} className="w-full border-blue-300 text-blue-700 hover:bg-blue-50">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Files
                  </Button>

                  {selectedFiles.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium">Selected Files ({selectedFiles.length}):</div>
                      <div className="max-h-[150px] overflow-y-auto space-y-1">
                        {selectedFiles.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2 text-xs bg-muted px-2 py-1 rounded">
                            <span className="truncate flex-1">{file.name}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 w-5 p-0 hover:bg-red-100 hover:text-red-600"
                              onClick={() => removeSelectedFile(idx)}
                              disabled={isIndexing}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      <Button
                        onClick={onStartIndex}
                        disabled={!selectedClassId || isIndexing || selectedFiles.length === 0}
                        className="w-full"
                      >
                        <PlayCircle className="h-4 w-4 mr-2" />
                        {isIndexing ? "Processing..." : `Start Index (${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''})`}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <Card className="p-4 col-span-1 lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">Indexed Syllabus/Schedule PDFs ({filesOnServer.length})</h3>
                {selectedClassId && filesOnServer.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                    onClick={onForceReindex}
                    disabled={isIndexing}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Force Re-index
                  </Button>
                )}
              </div>
              {!selectedClassId ? (
                <div className="text-sm text-muted-foreground">Select a class</div>
              ) : filesOnServer.length === 0 ? (
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">No syllabus/schedule files indexed yet. Upload and index PDFs to get started.</div>
                  {indexedChunkCount > 0 && (
                    <div className="pt-2 border-t">
                      <div className="text-xs text-muted-foreground mb-2">
                        Found {indexedChunkCount} orphaned chunk{indexedChunkCount !== 1 ? 's' : ''} from previous indexing.
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full border-orange-300 text-orange-700 hover:bg-orange-50"
                        onClick={async () => {
                          if (!confirm(`Clear all ${indexedChunkCount} chunks? This will remove all indexed data but keep uploaded PDFs.`)) return
                          try {
                            // Clear all chunks - this would need a special endpoint
                            // For now, delete all files which should clear chunks
                            const { corpusApi } = await import("@/lib/flask-api-client")
                            const files = await corpusApi.getFiles(selectedClassId, materialType)
                            // Delete all files to clear chunks
                            for (const filename of files.files || []) {
                              await corpusApi.deleteFile(selectedClassId, filename, materialType)
                            }
                            toast.success("All chunks cleared")
                            setIndexedChunkCount(0)
                            await loadIndexStats()
                          } catch (e) {
                            console.error("Clear chunks error", e)
                            toast.error("Clear chunks error")
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3 mr-2" />
                        Clear All Chunks ({indexedChunkCount})
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <ScrollArea className="h-[360px]">
                  <div className="space-y-2">
                    {filesOnServer.map((f, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 text-sm bg-muted px-3 py-2 rounded hover:bg-muted/80">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <FileText className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{f}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 hover:bg-red-100 hover:text-red-600"
                          onClick={() => deleteIndexedFile(f)}
                          disabled={isIndexing}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

