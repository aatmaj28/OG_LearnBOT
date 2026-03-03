"use client"

import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus, Users, Trash2, UserPlus, AlertTriangle, Upload, FileText, CheckCircle2, XCircle, FolderOpen, ChevronLeft, ChevronRight, X, Calendar, ExternalLink, Download } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import type { Class, User } from "@/lib/types"

interface BulkUploadResult {
  success: string[]
  alreadyEnrolled: string[]
  notRegistered: string[]
  invalidDomain: string[]
}

interface ClassManagementTabProps {
  isDarkMode?: boolean
}

export function ClassManagementTab({ isDarkMode = false }: ClassManagementTabProps) {
  const [classes, setClasses] = useState<Class[]>([])
  const [selectedClass, setSelectedClass] = useState<Class | null>(null)
  const [classStudents, setClassStudents] = useState<User[]>([])
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showAddStudentDialog, setShowAddStudentDialog] = useState(false)
  const [showBulkUploadDialog, setShowBulkUploadDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("")
  const [showRemoveStudentDialog, setShowRemoveStudentDialog] = useState(false)
  const [studentToRemove, setStudentToRemove] = useState<User | null>(null)
  const [newClassName, setNewClassName] = useState("")
  const [newClassDescription, setNewClassDescription] = useState("")
  const [bulkUploadResult, setBulkUploadResult] = useState<BulkUploadResult | null>(null)
  const [isProcessingBulk, setIsProcessingBulk] = useState(false)
  const [isSendingReminders, setIsSendingReminders] = useState(false)
  const [activeView, setActiveView] = useState<"students" | "assignments" | "resources">("students")
  const [resources, setResources] = useState<Array<{ name: string; size: number; uploadedAt: Date | string }>>([])
  const [isUploadingResources, setIsUploadingResources] = useState(false)
  const resourcesFileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0)
  const [uploadedFileIndices, setUploadedFileIndices] = useState<Set<number>>(new Set())
  const [showResourcePreviewDialog, setShowResourcePreviewDialog] = useState(false)
  const [previewResourceIndex, setPreviewResourceIndex] = useState<number | null>(null)
  const [isDownloadingResource, setIsDownloadingResource] = useState(false)
  const [previewResourceBlobUrl, setPreviewResourceBlobUrl] = useState<string | null>(null)
  const [previewResourceError, setPreviewResourceError] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<Array<{ id: string; name: string; pdfUrl: string; dueDate: string; canvasLink: string; createdAt: Date | string }>>([])
  const [showAddAssignmentDialog, setShowAddAssignmentDialog] = useState(false)
  const [newAssignment, setNewAssignment] = useState({ name: "", dueDate: "", canvasLink: "" })
  const [assignmentPdfFile, setAssignmentPdfFile] = useState<File | null>(null)
  const [isSubmittingAssignment, setIsSubmittingAssignment] = useState(false)
  const assignmentPdfInputRef = useRef<HTMLInputElement | null>(null)
  const [newStudent, setNewStudent] = useState({
    name: "",
    email: "",
    nuid: "",
    degree: "",
    major: "",
  })

  useEffect(() => {
    loadClasses()
  }, [])

  useEffect(() => {
    if (selectedClass) {
      loadClassStudents()
      setActiveView("students") // Reset to students view when class changes
    }
  }, [selectedClass])

  useEffect(() => {
    if (selectedClass && activeView === "resources") {
      loadResources()
    }
  }, [selectedClass, activeView])

  useEffect(() => {
    if (selectedClass && activeView === "assignments") {
      loadAssignments()
    }
  }, [selectedClass, activeView])

  const loadClasses = async () => {
    const facultyId = localStorage.getItem("userId")
    if (!facultyId) return

    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      const data = await classesApi.getClasses(facultyId)
      setClasses(data.classes)
    } catch (error) {
      console.error("[v0] Failed to load classes:", error)
    }
  }

  const loadClassStudents = async () => {
    if (!selectedClass) return

    try {
      const { usersApi } = await import("@/lib/flask-api-client")
      const students = await Promise.all(
        selectedClass.studentIds.map(async (studentId) => {
          try {
            const data = await usersApi.getUsers(undefined, studentId)
            return data.user
          } catch {
            return null
          }
        })
      )
      setClassStudents(students.filter((student): student is User => student !== null))
    } catch (error) {
      console.error("[v0] Failed to load class students:", error)
    }
  }


  const createClass = async () => {
    if (!newClassName.trim()) return

    const facultyId = localStorage.getItem("userId")
    if (!facultyId) return

    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      await classesApi.createClass({
        name: newClassName,
        description: newClassDescription,
        facultyId,
      })
      setNewClassName("")
      setNewClassDescription("")
      setShowCreateDialog(false)
      await loadClasses()
      toast.success('Class created successfully!')
    } catch (error: any) {
      console.error("[v0] Failed to create class:", error)
      toast.error(error?.message || 'Failed to create class')
    }
  }

  const addStudentToClass = async (studentId: string) => {
    if (!selectedClass) return

    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      await classesApi.addStudent(selectedClass.id, studentId)
      await loadClasses()
      // Find the updated class from the refreshed classes list
      const facultyId = localStorage.getItem("userId")
      if (facultyId) {
        const data = await classesApi.getClasses(facultyId)
        const updatedClass = data.classes.find((c: Class) => c.id === selectedClass.id)
        if (updatedClass) {
          setSelectedClass(updatedClass)
          await loadClassStudents()
        }
      }
    } catch (error) {
      console.error("[v0] Failed to add student:", error)
    }
  }

  const createAndAddStudent = async () => {
    if (!selectedClass || !newStudent.email) {
      toast.error('Please enter a student email address')
      return
    }

    // Validate Northeastern email domain
    if (!newStudent.email.endsWith('@northeastern.edu')) {
      toast.error('Please enter a valid Northeastern University email address (must end with @northeastern.edu)')
      return
    }

    try {
      const { usersApi, classesApi } = await import("@/lib/flask-api-client")

      // Check if student already exists by email
      let user
      try {
        const checkData = await usersApi.getUsers(undefined, undefined, newStudent.email)
        if (!checkData.user) {
          toast.error('This user does not exist', {
            description: 'Please ask the student to register first.'
          })
          return
        }
        user = checkData.user
      } catch (error: any) {
        if (error?.message?.includes('not found') || error?.message?.includes('404')) {
          toast.error('This user does not exist', {
            description: 'Please ask the student to register first.'
          })
          return
        }
        toast.error('Failed to check if student exists', {
          description: 'Please try again.'
        })
        return
      }

      // Check if student is already in this class
      if (selectedClass.studentIds.includes(user.id)) {
        toast.warning('Student already enrolled', {
          description: 'This student is already enrolled in this class.'
        })
        return
      }

      // Add the existing student to the class
      await classesApi.addStudent(selectedClass.id, user.id)

      // Reset form and close dialog
      setNewStudent({
        name: "",
        email: "",
        nuid: "",
        degree: "",
        major: "",
      })
      setShowAddStudentDialog(false)
      await loadClasses()
      // Find the updated class from the refreshed classes list
      const facultyId = localStorage.getItem("userId")
      if (facultyId) {
        const data = await classesApi.getClasses(facultyId)
        const updatedClass = data.classes.find((c: Class) => c.id === selectedClass.id)
        if (updatedClass) {
          setSelectedClass(updatedClass)
          await loadClassStudents()
        }
      }

      // Show success message
      toast.success('Student added successfully!')
    } catch (error) {
      console.error("[v0] Failed to add student:", error)
      toast.error('Failed to add student', {
        description: 'An unexpected error occurred. Please try again.'
      })
    }
  }

  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !selectedClass) return

    // Reset previous results
    setBulkUploadResult(null)
    setIsProcessingBulk(true)

    try {
      const text = await file.text()
      const lines = text.split('\n').map(line => line.trim()).filter(line => line)

      // Parse CSV - expect "email" header or just list of emails
      const emails: string[] = []
      const invalidDomainEmails: string[] = []
      let hasHeader = false

      lines.forEach((line, index) => {
        // Check if first line is a header
        if (index === 0 && (line.toLowerCase().includes('email') || line.toLowerCase().includes('e-mail'))) {
          hasHeader = true
          return
        }

        // Extract email from line (handle comma-separated or just email)
        const parts = line.split(',').map(p => p.trim())
        const email = parts.find(p => p.includes('@'))

        if (email) {
          if (email.includes('@northeastern.edu')) {
            emails.push(email.toLowerCase())
          } else {
            invalidDomainEmails.push(email.toLowerCase())
          }
        }
      })

      if (emails.length === 0) {
        toast.error('No valid emails found in CSV', {
          description: 'Please ensure the file contains Northeastern email addresses.'
        })
        setIsProcessingBulk(false)
        return
      }

      // Remove duplicates
      const uniqueEmails = Array.from(new Set(emails))

      const result: BulkUploadResult = {
        success: [],
        alreadyEnrolled: [],
        notRegistered: [],
        invalidDomain: [...new Set(invalidDomainEmails)]
      }

      const { usersApi, classesApi } = await import("@/lib/flask-api-client")

      // Process each email
      for (const email of uniqueEmails) {
        try {
          // Check if user exists
          let user
          try {
            const checkData = await usersApi.getUsers(undefined, undefined, email)
            if (!checkData.user) {
              result.notRegistered.push(email)
              continue
            }
            user = checkData.user
          } catch {
            result.notRegistered.push(email)
            continue
          }

          // Check if already enrolled
          if (selectedClass.studentIds.includes(user.id)) {
            result.alreadyEnrolled.push(email)
            continue
          }

          // Add student to class
          await classesApi.addStudent(selectedClass.id, user.id)
          result.success.push(email)
        } catch (error) {
          console.error(`Failed to process ${email}:`, error)
          result.notRegistered.push(email)
        }
      }

      setBulkUploadResult(result)
      setIsProcessingBulk(false)

      // Refresh the class data
      await loadClasses()
      const facultyId = localStorage.getItem("userId")
      if (facultyId) {
        const { classesApi } = await import("@/lib/flask-api-client")
        const data = await classesApi.getClasses(facultyId)
        const updatedClass = data.classes.find((c: Class) => c.id === selectedClass.id)
        if (updatedClass) {
          setSelectedClass(updatedClass)
          await loadClassStudents()
        }
      }

      // Show summary toast
      if (result.success.length > 0) {
        toast.success(`Successfully added ${result.success.length} student(s)`)
      }
      if (result.notRegistered.length > 0) {
        toast.warning(`${result.notRegistered.length} student(s) not registered`, {
          description: 'These students need to register first.'
        })
      }
    } catch (error) {
      console.error('CSV upload error:', error)
      toast.error('Failed to process CSV file', {
        description: 'Please check the file format and try again.'
      })
      setIsProcessingBulk(false)
    }

    // Reset file input
    event.target.value = ''
  }

  const handleRemoveStudentClick = (student: User) => {
    setStudentToRemove(student)
    setShowRemoveStudentDialog(true)
  }

  const removeStudentFromClass = async () => {
    if (!selectedClass || !studentToRemove) return

    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      await classesApi.removeStudent(selectedClass.id, studentToRemove.id)

      // Immediately update the local state to remove the student from UI
      setClassStudents(prevStudents =>
        prevStudents.filter(student => student.id !== studentToRemove.id)
      )

      // Update the selected class to reflect the new student count
      setSelectedClass(prevClass => {
        if (!prevClass) return prevClass
        return {
          ...prevClass,
          studentIds: prevClass.studentIds.filter(id => id !== studentToRemove.id)
        }
      })

      // Refresh the classes list in the background
      await loadClasses()

      // Store student name and class name before resetting
      const studentName = studentToRemove.name
      const className = selectedClass.name

      // Close dialog and reset
      setShowRemoveStudentDialog(false)
      setStudentToRemove(null)

      toast.success('Student removed successfully', {
        description: `${studentName} has been removed from ${className}.`
      })
    } catch (error) {
      console.error("[v0] Failed to remove student:", error)
      toast.error('Failed to remove student', {
        description: 'An unexpected error occurred. Please try again.'
      })
    }
  }

  const deleteClass = async () => {
    if (!selectedClass) return

    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      await classesApi.deleteClass(selectedClass.id)
      setShowDeleteDialog(false)
      setDeleteConfirmationText("")
      setSelectedClass(null)
      await loadClasses()
      toast.success('Class deleted successfully')
    } catch (error: any) {
      console.error("[v0] Failed to delete class:", error)
      toast.error('Failed to delete class', {
        description: error?.message || 'An unexpected error occurred. Please try again.'
      })
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
      console.error("[v0] Failed to load resources:", error)
    }
  }

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0 || !selectedClass) return

    // Filter only PDF files
    const pdfFiles = Array.from(files).filter(file => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))

    if (pdfFiles.length === 0) {
      toast.error("Please select PDF files only")
      if (resourcesFileInputRef.current) {
        resourcesFileInputRef.current.value = ""
      }
      return
    }

    if (pdfFiles.length !== files.length) {
      toast.warning(`Only ${pdfFiles.length} PDF file(s) selected. Non-PDF files were ignored.`)
    }

    setSelectedFiles(pdfFiles)
    setCurrentPreviewIndex(0)
    setUploadedFileIndices(new Set())
    setShowPreviewDialog(true)
  }

  const handleUploadCurrentFile = async () => {
    if (!selectedClass || selectedFiles.length === 0 || currentPreviewIndex >= selectedFiles.length) return

    const userId = localStorage.getItem("userId")
    if (!userId) {
      toast.error("User not authenticated")
      return
    }

    const fileToUpload = selectedFiles[currentPreviewIndex]
    setIsUploadingResources(true)

    try {
      const formData = new FormData()
      formData.append("files", fileToUpload)
      formData.append("classId", selectedClass.id)
      formData.append("userId", userId)

      const { classesApi } = await import("@/lib/flask-api-client")
      const result = await classesApi.uploadResources(selectedClass.id, [fileToUpload], userId)

      if (result.success) {
        // Mark this file as uploaded
        setUploadedFileIndices(prev => new Set([...prev, currentPreviewIndex]))
        toast.success(`Successfully uploaded ${fileToUpload.name}`)

        // Move to next file or close dialog if all uploaded
        if (currentPreviewIndex < selectedFiles.length - 1) {
          // Find next unuploaded file
          const nextIndex = selectedFiles.findIndex((_, idx) => idx > currentPreviewIndex && !uploadedFileIndices.has(idx))
          if (nextIndex !== -1) {
            setCurrentPreviewIndex(nextIndex)
          } else {
            // All remaining files uploaded, close dialog
            handleClosePreviewDialog()
          }
        } else {
          // Last file uploaded
          handleClosePreviewDialog()
        }

        await loadResources()
      } else {
        toast.error(`Failed to upload ${fileToUpload.name}`)
      }
    } catch (error) {
      console.error("[v0] Failed to upload resource:", error)
      toast.error(`Failed to upload ${fileToUpload.name}`)
    } finally {
      setIsUploadingResources(false)
    }
  }

  const handleClosePreviewDialog = () => {
    setShowPreviewDialog(false)
    setSelectedFiles([])
    setCurrentPreviewIndex(0)
    setUploadedFileIndices(new Set())
    if (resourcesFileInputRef.current) {
      resourcesFileInputRef.current.value = ""
    }
    loadResources()
  }


  const navigateToFile = (index: number) => {
    if (index >= 0 && index < selectedFiles.length) {
      setCurrentPreviewIndex(index)
    }
  }

  const deleteResource = async (fileName: string) => {
    if (!selectedClass) return

    const userId = localStorage.getItem("userId")
    if (!userId) {
      toast.error("User not authenticated")
      return
    }

    if (!confirm(`Are you sure you want to delete "${fileName}"?`)) {
      return
    }

    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      await classesApi.deleteResource(selectedClass.id, fileName, userId)
      toast.success("File deleted successfully")
      await loadResources()
    } catch (error) {
      console.error("[v0] Failed to delete resource:", error)
      toast.error("Failed to delete file")
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i]
  }

  const openResourcePreview = async (index: number) => {
    if (!selectedClass || !resources[index]) return

    const userId = localStorage.getItem("userId")
    if (!userId) return

    setPreviewResourceIndex(index)
    setShowResourcePreviewDialog(true)
    setPreviewResourceBlobUrl(null) // Clear previous blob URL
    setPreviewResourceError(null) // Clear previous error

    // Fetch the file as a blob and create an object URL for preview
    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      const blob = await classesApi.downloadResource(selectedClass.id, resources[index].name)
      const blobUrl = URL.createObjectURL(blob)
      setPreviewResourceBlobUrl(blobUrl)
      setPreviewResourceError(null)
    } catch (error: any) {
      console.error("[v0] Failed to load resource for preview:", error)
      const errorMessage = error?.message || "Failed to load resource for preview"
      setPreviewResourceError(errorMessage)
      toast.error(errorMessage)
    }
  }

  const downloadResource = async (fileName: string) => {
    if (!selectedClass || isDownloadingResource) return

    const userId = localStorage.getItem("userId")
    if (!userId) return

    setIsDownloadingResource(true)
    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      const blob = await classesApi.downloadResource(selectedClass.id, fileName)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      // Keep loading state for a brief moment to show feedback
      await new Promise(resolve => setTimeout(resolve, 300))
    } catch (error) {
      console.error("[v0] Failed to download resource:", error)
    } finally {
      setIsDownloadingResource(false)
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
      console.error("[v0] Failed to load assignments:", error)
    }
  }

  const handleAddAssignment = async () => {
    if (!selectedClass || !newAssignment.name.trim() || !newAssignment.dueDate || !assignmentPdfFile) {
      toast.error("Please fill in all required fields")
      return
    }

    // Validate due date is in the future
    if (new Date(newAssignment.dueDate) < new Date()) {
      toast.error("Please select a date and time in the future")
      return
    }

    const userId = localStorage.getItem("userId")
    if (!userId) {
      toast.error("User not authenticated")
      return
    }

    setIsSubmittingAssignment(true)
    try {
      const formData = new FormData()
      formData.append("name", newAssignment.name)
      formData.append("dueDate", newAssignment.dueDate)
      formData.append("canvasLink", newAssignment.canvasLink || "")
      formData.append("pdf", assignmentPdfFile)
      formData.append("classId", selectedClass.id)
      formData.append("userId", userId)

      const { classesApi } = await import("@/lib/flask-api-client")
      const result = await classesApi.createAssignment(formData)

      if (result.success) {
        toast.success("Assignment added successfully")
        setShowAddAssignmentDialog(false)
        setNewAssignment({ name: "", dueDate: "", canvasLink: "" })
        setAssignmentPdfFile(null)
        if (assignmentPdfInputRef.current) {
          assignmentPdfInputRef.current.value = ""
        }
        await loadAssignments()
      } else {
        toast.error(result.error || "Failed to add assignment")
      }
    } catch (error) {
      console.error("[v0] Failed to add assignment:", error)
      toast.error("Failed to add assignment")
    } finally {
      setIsSubmittingAssignment(false)
    }
  }

  const deleteAssignment = async (assignmentId: string) => {
    if (!selectedClass) return

    if (!confirm("Are you sure you want to delete this assignment? This action cannot be undone.")) {
      return
    }

    const userId = localStorage.getItem("userId")
    if (!userId) {
      toast.error("User not authenticated")
      return
    }

    try {
      const { classesApi } = await import("@/lib/flask-api-client")
      await classesApi.deleteAssignment(selectedClass.id, assignmentId, userId)
      toast.success("Assignment deleted successfully")
      await loadAssignments()
    } catch (error: any) {
      console.error("[v0] Failed to delete assignment:", error)
      toast.error(error?.message || "Failed to delete assignment")
    }
  }

  const sendReminderEmails = async () => {
    if (!selectedClass || !bulkUploadResult || bulkUploadResult.notRegistered.length === 0) return

    setIsSendingReminders(true)

    // Show spinner for a short time (1.5 seconds), then hide it while emails continue sending in background
    setTimeout(() => {
      setIsSendingReminders(false)
    }, 1500)

      // Fire off the request in the background (don't wait for it)
      ; (async () => {
        try {
          // Get faculty name
          const facultyId = localStorage.getItem("userId")
          let facultyName = ""

          if (facultyId) {
            const { usersApi } = await import("@/lib/flask-api-client")
            try {
              const facultyData = await usersApi.getUsers(undefined, facultyId)
              facultyName = facultyData.user?.name || ""
            } catch {
              // Ignore errors
            }
          }

          // Fire and forget - don't await, let it process in background
          const { classesApi } = await import("@/lib/flask-api-client")
          classesApi.sendReminder(
            bulkUploadResult.notRegistered,
            selectedClass.name,
            facultyName
          ).then((data) => {
            if (data?.results?.success?.length > 0) {
              toast.success(`Reminder emails sent successfully!`, {
                description: `Sent to ${data.results.success.length} student(s).`
              })
            }

            if (data?.results?.failed?.length > 0) {
              toast.warning(`Some emails failed to send`, {
                description: `Failed to send to ${data.results.failed.length} student(s).`
              })
            }
          }).catch((error) => {
            console.error("[v0] Failed to send reminder emails:", error)
            toast.error('Failed to send reminder emails', {
              description: 'An unexpected error occurred. Please try again.'
            })
          })
        } catch (error) {
          console.error("[v0] Failed to send reminder emails:", error)
          toast.error('Failed to send reminder emails', {
            description: 'An unexpected error occurred. Please try again.'
          })
        }
      })()

    // Show immediate feedback that emails are being sent in background
    toast.info('Sending reminder emails...', {
      description: `Processing ${bulkUploadResult.notRegistered.length} email(s) in the background. You'll be notified when complete.`
    })
  }



  return (
    <div className="h-full flex">
      {/* Classes List */}
      <div className={`w-96 border-r shadow-sm p-4 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>My Classes</h2>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md">
                <Plus className="h-4 w-4 mr-1" />
                New Class
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Class</DialogTitle>
                <DialogDescription>Add a new class to manage your students</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="className">Class Name</Label>
                  <Input
                    id="className"
                    placeholder="e.g., Introduction to Computer Science"
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="classDescription">Description</Label>
                  <Textarea
                    id="classDescription"
                    placeholder="Brief description of the class"
                    value={newClassDescription}
                    onChange={(e) => setNewClassDescription(e.target.value)}
                    rows={3}
                  />
                </div>
                <Button onClick={createClass} className="w-full">
                  Create Class
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="space-y-2">
            {classes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No classes yet. Create one to get started!
              </p>
            ) : (
              classes.map((classItem) => (
                <Card
                  key={classItem.id}
                  className={`p-3 cursor-pointer hover:bg-accent transition-colors ${selectedClass?.id === classItem.id ? "bg-accent" : ""
                    }`}
                  onClick={() => setSelectedClass(classItem)}
                >
                  <p className="font-medium text-sm">{classItem.name}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{classItem.description}</p>
                  <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    <span>{classItem.studentIds.length} students</span>
                  </div>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Class Details */}
      <div className="flex-1 p-6">
        {!selectedClass ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className={`p-4 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center shadow-lg ${isDarkMode ? 'bg-gradient-to-br from-blue-900 to-indigo-900' : 'bg-gradient-to-br from-blue-100 to-indigo-100'}`}>
                <Users className={`h-10 w-10 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
              </div>
              <h2 className={`text-2xl font-bold mb-3 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Select a Class</h2>
              <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Choose a class from the list to view and manage students</p>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className={`text-2xl font-bold mb-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{selectedClass.name}</h2>
                  <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>{selectedClass.description}</p>
                </div>
                <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                  <DialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Class
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        Delete Class
                      </DialogTitle>
                      <DialogDescription>
                        This action cannot be undone. This will permanently delete the class and remove all associated data.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                        <p className="text-sm font-medium text-destructive mb-2">
                          Type the class name exactly to confirm deletion:
                        </p>
                        <p className="text-sm font-mono bg-background p-2 rounded border">
                          {selectedClass.name}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="delete-confirmation">Confirmation</Label>
                        <Input
                          id="delete-confirmation"
                          placeholder={`Type "${selectedClass.name}" to confirm`}
                          value={deleteConfirmationText}
                          onChange={(e) => setDeleteConfirmationText(e.target.value)}
                        />
                      </div>
                      <div className="flex justify-end space-x-2 pt-4">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowDeleteDialog(false)
                            setDeleteConfirmationText("")
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={deleteClass}
                          disabled={deleteConfirmationText !== selectedClass.name}
                        >
                          Delete Class
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {/* View Selection Dropdown */}
              <div className="mb-4">
                <Select value={activeView} onValueChange={(value) => setActiveView(value as "students" | "assignments" | "resources")}>
                  <SelectTrigger className={`w-64 border-2 ${isDarkMode ? 'bg-gray-700 border-gray-500 text-gray-100 hover:border-gray-400' : 'border-gray-300 hover:border-gray-400'}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={isDarkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : ''}>
                    <SelectItem value="students" className={isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100' : ''}>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        <span>Manage Students</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="assignments" className={isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100' : ''}>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        <span>Assignments</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="resources" className={isDarkMode ? 'focus:bg-gray-700 focus:text-gray-100' : ''}>
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4" />
                        <span>Resources</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Remove Student Confirmation Dialog */}
            <Dialog open={showRemoveStudentDialog} onOpenChange={setShowRemoveStudentDialog}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Remove Student from Class</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to remove {studentToRemove?.name} from {selectedClass?.name}?
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <p className="text-sm text-muted-foreground">
                    This action will remove the student from this class. They will no longer have access to class materials or chat sessions.
                  </p>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowRemoveStudentDialog(false)
                      setStudentToRemove(null)
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={removeStudentFromClass}
                  >
                    Remove Student
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Content based on selected view */}
            {activeView === "students" && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Students</CardTitle>
                      <CardDescription>{selectedClass.studentIds.length} students enrolled</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Dialog open={showAddStudentDialog} onOpenChange={setShowAddStudentDialog}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50">
                            <UserPlus className="h-4 w-4 mr-2" />
                            Add Student
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                          <DialogHeader>
                            <DialogTitle>Add Student to Class</DialogTitle>
                            <DialogDescription>
                              Enter the registered student's email address. The student must have already registered an account.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="student-email">Student's Northeastern Email *</Label>
                              <Input
                                id="student-email"
                                type="email"
                                placeholder="student@northeastern.edu"
                                value={newStudent.email}
                                onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
                                className={newStudent.email && !newStudent.email.endsWith('@northeastern.edu') ? 'border-red-500' : ''}
                                autoFocus
                              />
                              {newStudent.email && !newStudent.email.endsWith('@northeastern.edu') && (
                                <p className="text-sm text-red-500">Email must end with @northeastern.edu</p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                Note: Student must register first before they can be added to a class.
                              </p>
                            </div>
                            <div className="flex justify-end space-x-2 pt-4">
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setShowAddStudentDialog(false)
                                  setNewStudent({
                                    name: "",
                                    email: "",
                                    nuid: "",
                                    degree: "",
                                    major: "",
                                  })
                                }}
                              >
                                Cancel
                              </Button>
                              <Button onClick={createAndAddStudent} disabled={!newStudent.email || !newStudent.email.endsWith('@northeastern.edu')}>
                                Add Student
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>

                      {/* Bulk Upload Dialog */}
                      <Dialog open={showBulkUploadDialog} onOpenChange={(open) => {
                        setShowBulkUploadDialog(open)
                        if (!open) {
                          setBulkUploadResult(null)
                          setIsProcessingBulk(false)
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button size="sm" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md">
                            <Upload className="h-4 w-4 mr-2" />
                            Bulk Upload (CSV)
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Bulk Upload Students from CSV</DialogTitle>
                            <DialogDescription>
                              Upload a CSV file containing student email addresses. Only registered students will be added.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            {!bulkUploadResult ? (
                              <>
                                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                                  <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                                  <Label htmlFor="csv-upload" className="cursor-pointer">
                                    <div className="space-y-2">
                                      <p className="text-sm font-medium">Click to upload CSV file</p>
                                      <p className="text-xs text-muted-foreground">
                                        File should contain one email per line or a column with "email" header
                                      </p>
                                    </div>
                                    <Input
                                      id="csv-upload"
                                      type="file"
                                      accept=".csv,.txt"
                                      onChange={handleCSVUpload}
                                      className="hidden"
                                      disabled={isProcessingBulk}
                                    />
                                  </Label>
                                  {isProcessingBulk && (
                                    <div className="mt-4">
                                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                                      <p className="text-sm text-muted-foreground mt-2">Processing...</p>
                                    </div>
                                  )}
                                </div>
                                <div className="bg-muted p-4 rounded-lg space-y-2">
                                  <p className="text-sm font-medium">CSV Format Example:</p>
                                  <pre className="text-xs bg-background p-2 rounded border">
                                    {`email
john.doe@northeastern.edu
sarah.smith@northeastern.edu
mike.johnson@northeastern.edu`}
                                  </pre>
                                  <p className="text-xs text-muted-foreground mt-2">
                                    Or just a simple list without header:
                                  </p>
                                  <pre className="text-xs bg-background p-2 rounded border">
                                    {`john.doe@northeastern.edu
sarah.smith@northeastern.edu
mike.johnson@northeastern.edu`}
                                  </pre>
                                </div>
                              </>
                            ) : (
                              <div className="space-y-4">
                                <div className="text-center pb-4 border-b">
                                  <h3 className="text-lg font-semibold mb-2">Upload Results</h3>
                                  <p className="text-sm text-muted-foreground">
                                    Processed {bulkUploadResult.success.length + bulkUploadResult.alreadyEnrolled.length + bulkUploadResult.notRegistered.length + bulkUploadResult.invalidDomain.length} email(s)
                                  </p>
                                </div>

                                {bulkUploadResult.success.length > 0 && (
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                                      <CheckCircle2 className="h-5 w-5" />
                                      <h4 className="font-medium">Successfully Added ({bulkUploadResult.success.length})</h4>
                                    </div>
                                    <ScrollArea className="h-32 rounded border p-2 bg-green-50 dark:bg-green-950/20">
                                      <div className="space-y-1">
                                        {bulkUploadResult.success.map((email, i) => (
                                          <p key={i} className="text-sm">{email}</p>
                                        ))}
                                      </div>
                                    </ScrollArea>
                                  </div>
                                )}

                                {bulkUploadResult.alreadyEnrolled.length > 0 && (
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                                      <AlertTriangle className="h-5 w-5" />
                                      <h4 className="font-medium">Already Enrolled ({bulkUploadResult.alreadyEnrolled.length})</h4>
                                    </div>
                                    <ScrollArea className="h-32 rounded border p-2 bg-blue-50 dark:bg-blue-950/20">
                                      <div className="space-y-1">
                                        {bulkUploadResult.alreadyEnrolled.map((email, i) => (
                                          <p key={i} className="text-sm">{email}</p>
                                        ))}
                                      </div>
                                    </ScrollArea>
                                  </div>
                                )}

                                {bulkUploadResult.notRegistered.length > 0 && (
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                                      <XCircle className="h-5 w-5" />
                                      <h4 className="font-medium">Not Registered ({bulkUploadResult.notRegistered.length})</h4>
                                    </div>
                                    <ScrollArea className="h-32 rounded border p-2 bg-red-50 dark:bg-red-950/20">
                                      <div className="space-y-1">
                                        {bulkUploadResult.notRegistered.map((email, i) => (
                                          <p key={i} className="text-sm">{email}</p>
                                        ))}
                                      </div>
                                    </ScrollArea>
                                    <div className="space-y-2">
                                      <p className="text-xs text-muted-foreground">
                                        These students need to register on LearnBOT first before they can be added to the class.
                                      </p>
                                      <Button
                                        onClick={sendReminderEmails}
                                        disabled={isSendingReminders}
                                        variant="outline"
                                        size="sm"
                                        className="w-full"
                                      >
                                        {isSendingReminders ? (
                                          <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                                            Sending Reminders...
                                          </>
                                        ) : (
                                          <>
                                            📧 Send Registration Reminder
                                          </>
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                )}

                                {bulkUploadResult.invalidDomain.length > 0 && (
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                                      <AlertTriangle className="h-5 w-5" />
                                      <h4 className="font-medium">Invalid Domain ({bulkUploadResult.invalidDomain.length})</h4>
                                    </div>
                                    <ScrollArea className="h-32 rounded border p-2 bg-yellow-50 dark:bg-yellow-950/20">
                                      <div className="space-y-1">
                                        {bulkUploadResult.invalidDomain.map((email, i) => (
                                          <p key={i} className="text-sm">{email}</p>
                                        ))}
                                      </div>
                                    </ScrollArea>
                                    <p className="text-xs text-muted-foreground">
                                      Only @northeastern.edu emails are supported.
                                    </p>
                                  </div>
                                )}

                                <div className="flex justify-end gap-2 pt-4">
                                  <Button
                                    onClick={() => {
                                      setBulkUploadResult(null)
                                      setShowBulkUploadDialog(false)
                                    }}
                                  >
                                    Done
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {classStudents.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No students enrolled yet. Add students to get started!
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {classStudents.map((student) => (
                        <div
                          key={student.id}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent transition-colors"
                        >
                          <div className="flex-1">
                            <p className="font-medium text-sm">{student.name}</p>
                            <p className="text-xs text-muted-foreground">{student.email}</p>
                            {(student.nuid || student.degree || student.major) && (
                              <div className="flex flex-wrap gap-2 mt-1">
                                {student.nuid && (
                                  <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                                    NUID: {student.nuid}
                                  </span>
                                )}
                                {student.degree && (
                                  <span className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded">
                                    {student.degree}
                                  </span>
                                )}
                                {student.major && (
                                  <span className="text-xs bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2 py-1 rounded">
                                    {student.major}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveStudentClick(student)}
                            className="cursor-pointer hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {activeView === "assignments" && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Assignments</CardTitle>
                      <CardDescription>Manage assignments for {selectedClass.name}</CardDescription>
                    </div>
                    <Dialog open={showAddAssignmentDialog} onOpenChange={setShowAddAssignmentDialog}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md">
                          <Plus className="h-4 w-4 mr-2" />
                          Add Assignment
                        </Button>
                      </DialogTrigger>
                      <DialogContent className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
                        <DialogHeader>
                          <DialogTitle className={isDarkMode ? 'text-gray-100' : ''}>Add New Assignment</DialogTitle>
                          <DialogDescription className={isDarkMode ? 'text-gray-400' : ''}>
                            Create a new assignment with details and PDF
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="assignment-name" className={isDarkMode ? 'text-gray-300' : ''}>
                              Assignment Name *
                            </Label>
                            <Input
                              id="assignment-name"
                              placeholder="e.g., Homework 1, Midterm Project"
                              value={newAssignment.name}
                              onChange={(e) => setNewAssignment({ ...newAssignment, name: e.target.value })}
                              className={isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : ''}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="assignment-pdf" className={isDarkMode ? 'text-gray-300' : ''}>
                              Assignment PDF *
                            </Label>
                            <input
                              ref={assignmentPdfInputRef}
                              type="file"
                              accept=".pdf,application/pdf"
                              onChange={(e) => setAssignmentPdfFile(e.target.files?.[0] || null)}
                              className="hidden"
                            />
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => assignmentPdfInputRef.current?.click()}
                                className={isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100 hover:bg-gray-600' : ''}
                              >
                                <Upload className="h-4 w-4 mr-2" />
                                {assignmentPdfFile ? assignmentPdfFile.name : "Choose PDF File"}
                              </Button>
                              {assignmentPdfFile && (
                                <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                  {formatFileSize(assignmentPdfFile.size)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="assignment-due-date" className={isDarkMode ? 'text-gray-300' : ''}>
                              Due Date *
                            </Label>
                            <DateTimePicker
                              value={newAssignment.dueDate}
                              onChange={(value) => {
                                const selectedDate = new Date(value)
                                const now = new Date()
                                if (selectedDate < now) {
                                  toast.error("Please select a date and time in the future")
                                  return
                                }
                                setNewAssignment({ ...newAssignment, dueDate: value })
                              }}
                              min={new Date()}
                              isDarkMode={isDarkMode}
                              className={isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : ''}
                            />
                            {newAssignment.dueDate && new Date(newAssignment.dueDate) < new Date() && (
                              <p className="text-sm text-red-500">Please select a future date and time</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="assignment-canvas-link" className={isDarkMode ? 'text-gray-300' : ''}>
                              Canvas Assignment Link (Optional)
                            </Label>
                            <Input
                              id="assignment-canvas-link"
                              type="url"
                              placeholder="https://canvas.northeastern.edu/..."
                              value={newAssignment.canvasLink}
                              onChange={(e) => setNewAssignment({ ...newAssignment, canvasLink: e.target.value })}
                              className={isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : ''}
                            />
                          </div>
                        </div>
                        <div className="flex justify-end space-x-2 pt-4 border-t">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setShowAddAssignmentDialog(false)
                              setNewAssignment({ name: "", dueDate: "", canvasLink: "" })
                              setAssignmentPdfFile(null)
                              if (assignmentPdfInputRef.current) {
                                assignmentPdfInputRef.current.value = ""
                              }
                            }}
                            disabled={isSubmittingAssignment}
                            className={isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100 hover:bg-gray-600' : ''}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleAddAssignment}
                            disabled={isSubmittingAssignment || !newAssignment.name.trim() || !newAssignment.dueDate || !assignmentPdfFile}
                            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                          >
                            {isSubmittingAssignment ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                Adding...
                              </>
                            ) : (
                              "Add"
                            )}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {assignments.length === 0 ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <FileText className={`mx-auto h-12 w-12 mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                        <p className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>No assignments yet</p>
                        <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>Click "Add Assignment" to create your first assignment</p>
                      </div>
                    </div>
                  ) : (
                    <ScrollArea className="h-[calc(100vh-300px)]">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {assignments.map((assignment) => (
                          <Card
                            key={assignment.id}
                            className={`p-4 relative ${isDarkMode ? 'bg-gray-800 border-gray-700 hover:bg-gray-750' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                          >
                            <div className="flex items-start justify-between mb-3">
                              <h3 className={`font-semibold text-lg flex-1 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                                {assignment.name}
                              </h3>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteAssignment(assignment.id)}
                                className={`h-6 w-6 flex-shrink-0 ${isDarkMode ? 'hover:bg-red-900/50 text-red-400 hover:text-red-300' : 'hover:bg-red-100 text-red-600 hover:text-red-700'}`}
                                title="Delete assignment"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="space-y-2 mb-4">
                              <div className="flex items-center gap-2">
                                <Calendar className={`h-4 w-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                                <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                  Due: {new Date(assignment.dueDate).toLocaleString()}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  if (!selectedClass) return
                                  try {
                                    const { classesApi } = await import("@/lib/flask-api-client")
                                    const blob = await classesApi.downloadAssignment(selectedClass.id, assignment.id)
                                    const url = window.URL.createObjectURL(blob)
                                    const link = document.createElement('a')
                                    link.href = url
                                    link.download = assignment.name.replace(/[^a-zA-Z0-9_.-]/g, '_') + '.pdf'
                                    document.body.appendChild(link)
                                    link.click()
                                    document.body.removeChild(link)
                                    window.URL.revokeObjectURL(url)
                                    toast.success("Download started")
                                  } catch (error) {
                                    console.error("[v0] Failed to download assignment:", error)
                                    toast.error("Failed to download assignment")
                                  }
                                }}
                                className={`w-full ${isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100 hover:bg-gray-600' : ''}`}
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Download PDF
                              </Button>
                              {assignment.canvasLink && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    window.open(assignment.canvasLink, '_blank')
                                  }}
                                  className={`w-full ${isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100 hover:bg-gray-600' : ''}`}
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
            )}

            {activeView === "resources" && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Resources</CardTitle>
                      <CardDescription>Manage resources for {selectedClass.name}</CardDescription>
                    </div>
                    <div>
                      <input
                        ref={resourcesFileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,application/pdf"
                        onChange={handleFileSelection}
                        className="hidden"
                        disabled={isUploadingResources || showPreviewDialog}
                      />
                      <Button
                        size="sm"
                        onClick={() => resourcesFileInputRef.current?.click()}
                        disabled={isUploadingResources || showPreviewDialog}
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Files
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {resources.length === 0 ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <FolderOpen className={`mx-auto h-12 w-12 mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                        <p className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>No resources yet</p>
                        <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>Upload files to share with students</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {resources.map((resource, index) => (
                        <div
                          key={index}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-colors group ${isDarkMode
                            ? 'bg-gray-800 border-gray-700 hover:bg-gray-750'
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                            }`}
                        >
                          <div
                            className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                            onClick={() => openResourcePreview(index)}
                          >
                            <FileText className={`h-5 w-5 flex-shrink-0 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                            <div className="flex-1 min-w-0">
                              <p className={`font-medium text-sm truncate ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>
                                {resource.name}
                              </p>
                              <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                {formatFileSize(resource.size)} • {new Date(resource.uploadedAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteResource(resource.name)
                            }}
                            className={`flex-shrink-0 ${isDarkMode ? 'hover:bg-red-900/50 text-red-400 hover:text-red-300' : 'hover:bg-red-100 text-red-600 hover:text-red-700'}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* PDF Preview Dialog */}
            <Dialog open={showPreviewDialog} onOpenChange={(open) => {
              if (!open && !isUploadingResources) {
                handleClosePreviewDialog()
              }
            }}>
              <DialogContent className="max-w-6xl w-[95vw] max-h-[95vh] h-[95vh] flex flex-col p-0">
                <DialogHeader className="px-6 pt-4 pb-3 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <DialogTitle className="text-lg">Preview PDF - {selectedFiles[currentPreviewIndex]?.name || ""}</DialogTitle>
                      <DialogDescription className="text-sm">
                        File {currentPreviewIndex + 1} of {selectedFiles.length}
                        {uploadedFileIndices.has(currentPreviewIndex) && (
                          <span className="ml-2 text-green-600 dark:text-green-400">✓ Uploaded</span>
                        )}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <div className="flex-1 flex flex-col min-h-0 px-6 overflow-hidden">
                  {/* File Navigation Menu */}
                  <div className={`mb-3 p-2.5 rounded-lg border flex-shrink-0 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex items-center gap-2 overflow-x-auto">
                      {selectedFiles.map((file, index) => (
                        <button
                          key={index}
                          onClick={() => navigateToFile(index)}
                          disabled={isUploadingResources}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${index === currentPreviewIndex
                            ? isDarkMode
                              ? 'bg-blue-600 text-white'
                              : 'bg-blue-600 text-white'
                            : uploadedFileIndices.has(index)
                              ? isDarkMode
                                ? 'bg-green-900/50 text-green-400 hover:bg-green-900/70'
                                : 'bg-green-100 text-green-700 hover:bg-green-200'
                              : isDarkMode
                                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                : 'bg-white text-gray-700 hover:bg-gray-100'
                            } ${isUploadingResources ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          {uploadedFileIndices.has(index) && '✓ '}
                          {file.name.length > 20 ? `${file.name.substring(0, 20)}...` : file.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* PDF Preview */}
                  <div className="flex-1 border rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900 min-h-0" style={{ height: 'calc(95vh - 250px)' }}>
                    {selectedFiles[currentPreviewIndex] && (
                      <iframe
                        src={URL.createObjectURL(selectedFiles[currentPreviewIndex])}
                        className="w-full h-full"
                        title={`Preview of ${selectedFiles[currentPreviewIndex].name}`}
                        style={{ border: 'none', minHeight: '600px' }}
                      />
                    )}
                  </div>

                  {/* Navigation and Action Buttons */}
                  <div className="flex items-center justify-between mt-3 pt-3 pb-4 border-t flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (currentPreviewIndex > 0) {
                            navigateToFile(currentPreviewIndex - 1)
                          }
                        }}
                        disabled={currentPreviewIndex === 0 || isUploadingResources}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (currentPreviewIndex < selectedFiles.length - 1) {
                            navigateToFile(currentPreviewIndex + 1)
                          }
                        }}
                        disabled={currentPreviewIndex === selectedFiles.length - 1 || isUploadingResources}
                      >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={handleUploadCurrentFile}
                        disabled={isUploadingResources || uploadedFileIndices.has(currentPreviewIndex)}
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                      >
                        {isUploadingResources ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Uploading...
                          </>
                        ) : uploadedFileIndices.has(currentPreviewIndex) ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Uploaded
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Resource Preview Dialog */}
        {showResourcePreviewDialog && previewResourceIndex !== null && resources[previewResourceIndex] && (
          <Dialog open={showResourcePreviewDialog} onOpenChange={(open) => {
            if (!open && !isDownloadingResource) {
              if (previewResourceBlobUrl) {
                URL.revokeObjectURL(previewResourceBlobUrl)
                setPreviewResourceBlobUrl(null)
              }
              setPreviewResourceError(null)
              setShowResourcePreviewDialog(false)
              setPreviewResourceIndex(null)
            }
          }}>
            <DialogContent className="max-w-6xl w-[95vw] max-h-[95vh] h-[95vh] flex flex-col p-0">
              <DialogHeader className="px-6 pt-4 pb-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-lg">Preview PDF - {resources[previewResourceIndex].name}</DialogTitle>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex-1 flex flex-col min-h-0 px-6 overflow-hidden">
                {/* PDF Preview */}
                <div className="flex-1 border rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900 min-h-0" style={{ height: 'calc(95vh - 200px)' }}>
                  {resources[previewResourceIndex] && previewResourceBlobUrl && !previewResourceError && (
                    <iframe
                      src={previewResourceBlobUrl}
                      className="w-full h-full"
                      title={`Preview of ${resources[previewResourceIndex].name}`}
                      style={{ border: 'none', minHeight: '600px' }}
                    />
                  )}
                  {resources[previewResourceIndex] && !previewResourceBlobUrl && !previewResourceError && (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                        <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Loading preview...</p>
                      </div>
                    </div>
                  )}
                  {previewResourceError && (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <p className={`text-lg font-semibold mb-2 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>Error loading preview</p>
                        <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{previewResourceError}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end mt-3 pt-3 pb-4 border-t flex-shrink-0">
                  <Button
                    onClick={() => downloadResource(resources[previewResourceIndex].name)}
                    disabled={isDownloadingResource}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                  >
                    {isDownloadingResource ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  )
}
