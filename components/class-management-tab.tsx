"use client"

import { useState, useEffect } from "react"
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
import { Plus, Users, Trash2, UserPlus } from "lucide-react"
import type { Class, User } from "@/lib/types"

export function ClassManagementTab() {
  const [classes, setClasses] = useState<Class[]>([])
  const [allStudents, setAllStudents] = useState<User[]>([])
  const [selectedClass, setSelectedClass] = useState<Class | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showAddStudentDialog, setShowAddStudentDialog] = useState(false)
  const [newClassName, setNewClassName] = useState("")
  const [newClassDescription, setNewClassDescription] = useState("")

  useEffect(() => {
    loadClasses()
    loadStudents()
  }, [])

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

  const loadStudents = async () => {
    try {
      const response = await fetch("/api/users?role=student")
      if (response.ok) {
        const data = await response.json()
        setAllStudents(data.users)
      }
    } catch (error) {
      console.error("[v0] Failed to load students:", error)
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
        const updatedClass = classes.find((c) => c.id === selectedClass.id)
        if (updatedClass) {
          setSelectedClass(updatedClass)
        }
      }
    } catch (error) {
      console.error("[v0] Failed to add student:", error)
    }
  }

  const removeStudentFromClass = async (studentId: string) => {
    if (!selectedClass) return

    try {
      const response = await fetch("/api/classes/remove-student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: selectedClass.id,
          studentId,
        }),
      })

      if (response.ok) {
        await loadClasses()
        const updatedClass = classes.find((c) => c.id === selectedClass.id)
        if (updatedClass) {
          setSelectedClass(updatedClass)
        }
      }
    } catch (error) {
      console.error("[v0] Failed to remove student:", error)
    }
  }

  const getStudentById = (id: string) => allStudents.find((s) => s.id === id)

  const availableStudents = allStudents.filter((student) => !selectedClass?.studentIds.includes(student.id))

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
              <h2 className="text-2xl font-bold mb-2">{selectedClass.name}</h2>
              <p className="text-muted-foreground">{selectedClass.description}</p>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Students</CardTitle>
                    <CardDescription>{selectedClass.studentIds.length} students enrolled</CardDescription>
                  </div>
                  <Dialog open={showAddStudentDialog} onOpenChange={setShowAddStudentDialog}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <UserPlus className="h-4 w-4 mr-2" />
                        Add Student
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Student to Class</DialogTitle>
                        <DialogDescription>Select a student to add to {selectedClass.name}</DialogDescription>
                      </DialogHeader>
                      <ScrollArea className="h-[300px] pr-4">
                        <div className="space-y-2">
                          {availableStudents.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">
                              All students are already enrolled
                            </p>
                          ) : (
                            availableStudents.map((student) => (
                              <Card
                                key={student.id}
                                className="p-3 cursor-pointer hover:bg-accent transition-colors"
                                onClick={() => {
                                  addStudentToClass(student.id)
                                  setShowAddStudentDialog(false)
                                }}
                              >
                                <p className="font-medium text-sm">{student.name}</p>
                                <p className="text-xs text-muted-foreground">{student.email}</p>
                              </Card>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {selectedClass.studentIds.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No students enrolled yet. Add students to get started!
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedClass.studentIds.map((studentId) => {
                      const student = getStudentById(studentId)
                      if (!student) return null

                      return (
                        <div
                          key={studentId}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent transition-colors"
                        >
                          <div>
                            <p className="font-medium text-sm">{student.name}</p>
                            <p className="text-xs text-muted-foreground">{student.email}</p>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => removeStudentFromClass(studentId)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )
                    })}
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
