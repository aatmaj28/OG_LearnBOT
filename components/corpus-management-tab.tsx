"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Upload, PlayCircle, FileText, Database, Trash2, BookOpen, Calendar } from "lucide-react"
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
  const [entireCorpusStats, setEntireCorpusStats] = useState<{exists: boolean, totalChunks?: number, totalPdfs?: number} | null>(null)
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
      const res = await fetch(`/api/classes?facultyId=${userId}`)
      if (res.ok) {
        const data = await res.json()
        setClasses(data.classes || [])
        if (data.classes && data.classes.length > 0) {
          setSelectedClassId(data.classes[0].id)
        }
      }
    } catch (e) {
      console.error("Failed to load classes", e)
    }
  }

  const loadServerFiles = async () => {
    if (!selectedClassId) return
    try {
      const res = await fetch(`/api/corpus/files?classId=${selectedClassId}&materialType=${materialType}`)
      if (res.ok) {
        const data = await res.json()
        setFilesOnServer(data.files || [])
      }
    } catch (e) {
      console.error("Failed to load server files", e)
    }
  }

  const loadIndexStats = async () => {
    if (!selectedClassId) return
    try {
      const res = await fetch(`/api/corpus/stats?classId=${selectedClassId}&materialType=${materialType}`)
      if (res.ok) {
        const data = await res.json()
        setIndexedPdfCount(data.pdfCount || 0)
        setIndexedChunkCount(data.chunkCount || 0)
      }
    } catch (e) {
      console.error("Failed to load index stats", e)
    }
  }

  const deleteIndexedFile = async (filename: string) => {
    if (!selectedClassId) return
    if (!confirm(`Delete ${filename}?\n\nThis will remove the PDF and its embeddings from the index.`)) return
    try {
      const res = await fetch(`/api/corpus/files?classId=${selectedClassId}&filename=${encodeURIComponent(filename)}&materialType=${materialType}`, {
        method: "DELETE"
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(data.message || "PDF and embeddings removed")
        // Update stats immediately from response
        if (data.pdfCount !== undefined) {
          setIndexedPdfCount(data.pdfCount)
        }
        if (data.chunkCount !== undefined) {
          setIndexedChunkCount(data.chunkCount)
        }
        await loadServerFiles()
        // Also reload stats as fallback (in case response didn't include stats)
        await loadIndexStats()
      } else {
        toast.error("Failed to delete file")
      }
    } catch (e) {
      console.error("Delete error", e)
      toast.error("Delete error")
    }
  }

  const onPickFiles = () => {
    fileInputRef.current?.click()
  }

  const onFilesChosen: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const files = Array.from(e.target.files || [])
    const pdfs = files.filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))
    setSelectedFiles(prev => [...prev, ...pdfs])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const onStartIndex = async () => {
    if (!selectedClassId || selectedFiles.length === 0) return
    
    setIsIndexing(true)
    setIsUploading(true)
    
    try {
      // Step 1: Upload PDFs
      const materialLabel = materialType === "syllabus" ? "Syllabus/Schedule" : "Class Material"
      toast.info(`Uploading ${selectedFiles.length} ${materialLabel} PDF(s)...`)
      const form = new FormData()
      selectedFiles.forEach(f => form.append("files", f))
      const uploadRes = await fetch(`/api/corpus/upload?classId=${selectedClassId}&materialType=${materialType}`, {
        method: "POST",
        body: form,
      })
      
      if (!uploadRes.ok) {
        toast.error("Upload failed")
        return
      }
      
      toast.success("PDFs uploaded. Starting indexing...")
      
      // Step 2: Index all PDFs (including newly uploaded ones)
      const indexRes = await fetch(`/api/corpus/index`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: selectedClassId, materialType }),
      })
      
      if (indexRes.ok) {
        const data = await indexRes.json()
        toast.success("PDF indexed successfully")
        // Update stats immediately from response
        if (data.pdfCount !== undefined) {
          setIndexedPdfCount(data.pdfCount)
        }
        if (data.chunkCount !== undefined) {
          setIndexedChunkCount(data.chunkCount)
        }
        setSelectedFiles([]) // Clear selected files after successful indexing
        await loadServerFiles() // Reload to show all indexed PDFs
        // Also reload stats as fallback (in case response didn't include stats)
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
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Upload PDFs and build vector index for different content types</p>
          </div>
        </div>
        {selectedClassId && (
          <div className="flex gap-4 items-center bg-indigo-50 dark:bg-indigo-950 px-4 py-2 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold text-indigo-600">{indexedPdfCount}</div>
              <div className="text-xs text-muted-foreground">PDFs Indexed</div>
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
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={onFilesChosen}
              />
              <Button variant="outline" onClick={onPickFiles} disabled={!selectedClassId || isIndexing} className="w-full border-blue-300 text-blue-700 hover:bg-blue-50">
                <Upload className="h-4 w-4 mr-2" />
                Upload PDFs
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
                    {isIndexing ? "Processing..." : `Start Index (${selectedFiles.length} PDF${selectedFiles.length > 1 ? 's' : ''})`}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-4 col-span-1 lg:col-span-2">
          <h3 className="font-medium mb-3">Indexed PDFs in Corpus ({filesOnServer.length})</h3>
          {!selectedClassId ? (
            <div className="text-sm text-muted-foreground">Select a class</div>
          ) : filesOnServer.length === 0 ? (
            <div className="space-y-2">
            <div className="text-sm text-muted-foreground">No files indexed yet. Upload and index PDFs to get started.</div>
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
                    accept="application/pdf"
                    multiple
                    className="hidden"
                    onChange={onFilesChosen}
                  />
                  <Button variant="outline" onClick={onPickFiles} disabled={!selectedClassId || isIndexing} className="w-full border-blue-300 text-blue-700 hover:bg-blue-50">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload PDFs
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
                        {isIndexing ? "Processing..." : `Start Index (${selectedFiles.length} PDF${selectedFiles.length > 1 ? 's' : ''})`}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <Card className="p-4 col-span-1 lg:col-span-2">
              <h3 className="font-medium mb-3">Indexed Syllabus/Schedule PDFs ({filesOnServer.length})</h3>
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
      </Tabs>
    </div>
  )
}

