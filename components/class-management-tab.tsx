"use client"

import { useState, useEffect } from "react"
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
import { Plus, Users, Trash2, UserPlus, AlertTriangle, Upload, FileText, CheckCircle2, XCircle } from "lucide-react"
import type { Class, User } from "@/lib/types"

interface BulkUploadResult {
  success: string[]
  alreadyEnrolled: string[]
  notRegistered: string[]
}

export function ClassManagementTab() {
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
    }
  }, [selectedClass])

  const loadClasses = async () => {
    const facultyId = localStorage.getItem("userId")
    if (!facultyId) return

    try {
      const response = await fetch(`/api/classes?facultyId=${facultyId}`)
      if (response.ok) {
        const data = await response.json()
        setClasses(data.classes)
      }
    } catch (error) {
      console.error("[v0] Failed to load classes:", error)
    }
  }

  const loadClassStudents = async () => {
    if (!selectedClass) return

    try {
      const students = await Promise.all(
        selectedClass.studentIds.map(async (studentId) => {
          const response = await fetch(`/api/users?id=${studentId}`)
          if (response.ok) {
            const data = await response.json()
            return data.user
          }
          return null
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
      const response = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newClassName,
          description: newClassDescription,
          facultyId,
        }),
      })

      if (response.ok) {
        setNewClassName("")
        setNewClassDescription("")
        setShowCreateDialog(false)
        await loadClasses()
      }
    } catch (error) {
      console.error("[v0] Failed to create class:", error)
    }
  }

  const addStudentToClass = async (studentId: string) => {
    if (!selectedClass) return

    try {
      const response = await fetch("/api/classes/add-student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: selectedClass.id,
          studentId,
        }),
      })

      if (response.ok) {
        await loadClasses()
        // Find the updated class from the refreshed classes list
        const updatedClasses = await fetch(`/api/classes?facultyId=${localStorage.getItem("userId")}`)
        if (updatedClasses.ok) {
          const data = await updatedClasses.json()
          const updatedClass = data.classes.find((c: Class) => c.id === selectedClass.id)
          if (updatedClass) {
            setSelectedClass(updatedClass)
            await loadClassStudents()
          }
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
      // Check if student already exists by email
      const checkResponse = await fetch(`/api/users?email=${encodeURIComponent(newStudent.email)}`)
      const checkData = await checkResponse.json()
      
      // If response is not OK, handle different cases
      if (!checkResponse.ok) {
        // 404 means user not found - this is expected
        if (checkResponse.status === 404 || checkData.error === "User not found") {
          toast.error('This user does not exist', {
            description: 'Please ask the student to register first.'
          })
          return
        } else {
          // Actual error occurred
          toast.error('Failed to check if student exists', {
            description: 'Please try again.'
          })
          return
        }
      }

      // If student doesn't exist (no user in response), show error
      if (!checkData.user) {
        toast.error('This user does not exist', {
          description: 'Please ask the student to register first.'
        })
        return
      }

      const user = checkData.user
      
      // Check if student is already in this class
      if (selectedClass.studentIds.includes(user.id)) {
        toast.warning('Student already enrolled', {
          description: 'This student is already enrolled in this class.'
        })
        return
      }

      // Add the existing student to the class
      const addResponse = await fetch("/api/classes/add-student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: selectedClass.id,
          studentId: user.id,
        }),
      })

      if (addResponse.ok) {
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
        const updatedClasses = await fetch(`/api/classes?facultyId=${localStorage.getItem("userId")}`)
        if (updatedClasses.ok) {
          const data = await updatedClasses.json()
          const updatedClass = data.classes.find((c: Class) => c.id === selectedClass.id)
          if (updatedClass) {
            setSelectedClass(updatedClass)
            await loadClassStudents()
          }
        }
        
        // Show success message
        toast.success('Student added successfully!')
      } else {
        toast.error('Failed to add student to class')
      }
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
        
        if (email && email.includes('@northeastern.edu')) {
          emails.push(email.toLowerCase())
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
        notRegistered: []
      }

      // Process each email
      for (const email of uniqueEmails) {
        try {
          // Check if user exists
          const checkResponse = await fetch(`/api/users?email=${encodeURIComponent(email)}`)
          
          if (!checkResponse.ok || checkResponse.status === 404) {
            result.notRegistered.push(email)
            continue
          }

          const checkData = await checkResponse.json()
          if (!checkData.user) {
            result.notRegistered.push(email)
            continue
          }

          const user = checkData.user

          // Check if already enrolled
          if (selectedClass.studentIds.includes(user.id)) {
            result.alreadyEnrolled.push(email)
            continue
          }

          // Add student to class
          const addResponse = await fetch("/api/classes/add-student", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              classId: selectedClass.id,
              studentId: user.id,
            }),
          })

          if (addResponse.ok) {
            result.success.push(email)
          } else {
            result.notRegistered.push(email) // Failed to add
          }
        } catch (error) {
          console.error(`Failed to process ${email}:`, error)
          result.notRegistered.push(email)
        }
      }

      setBulkUploadResult(result)
      setIsProcessingBulk(false)

      // Refresh the class data
      await loadClasses()
      const updatedClasses = await fetch(`/api/classes?facultyId=${localStorage.getItem("userId")}`)
      if (updatedClasses.ok) {
        const data = await updatedClasses.json()
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
      const response = await fetch("/api/classes/remove-student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: selectedClass.id,
          studentId: studentToRemove.id,
        }),
      })

      if (response.ok) {
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
      } else {
        toast.error('Failed to remove student', {
          description: 'An error occurred while removing the student.'
        })
      }
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
      const response = await fetch("/api/classes/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: selectedClass.id,
        }),
      })

      if (response.ok) {
        setShowDeleteDialog(false)
        setDeleteConfirmationText("")
        setSelectedClass(null)
        await loadClasses()
        toast.success('Class deleted successfully')
      } else {
        const errorData = await response.json()
        toast.error('Failed to delete class', {
          description: errorData.error || 'An error occurred while deleting the class.'
        })
      }
    } catch (error) {
      console.error("[v0] Failed to delete class:", error)
      toast.error('Failed to delete class', {
        description: 'An unexpected error occurred. Please try again.'
      })
    }
  }



  return (
    <div className="h-full flex">
      {/* Classes List */}
      <div className="w-96 border-r bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">My Classes</h2>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
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
                  className={`p-3 cursor-pointer hover:bg-accent transition-colors ${
                    selectedClass?.id === classItem.id ? "bg-accent" : ""
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
              <div className="p-4 bg-indigo-100 dark:bg-indigo-900 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                <Users className="h-10 w-10 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h2 className="text-2xl font-bold mb-3">Select a Class</h2>
              <p className="text-muted-foreground">Choose a class from the list to view and manage students</p>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold mb-2">{selectedClass.name}</h2>
                  <p className="text-muted-foreground">{selectedClass.description}</p>
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
              </div>
            </div>

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
                        <Button size="sm" variant="outline">
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
                        <Button size="sm">
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
                                  Processed {bulkUploadResult.success.length + bulkUploadResult.alreadyEnrolled.length + bulkUploadResult.notRegistered.length} email(s)
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
                                  <p className="text-xs text-muted-foreground mt-2">
                                    These students need to register on LearnBOT first before they can be added to the class.
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
          </div>
        )}
      </div>
    </div>
  )
}
