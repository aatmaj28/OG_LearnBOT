import { type NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { promisify } from "util";
import { getClassById, createAssignment, getAssignmentsByClass, getAssignmentsByStudent, getAssignmentById } from "@/lib/db-service";
import { getUserById } from "@/lib/db-service";
import pool from "@/lib/db";

const assignmentsDir = path.join(process.cwd(), "assignments");

// Helper to ensure directory exists
const ensureDirExists = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// GET: List assignments for a class (with access control)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("classId");
  const userId = request.headers.get("x-user-id") || new URL(request.url).searchParams.get("userId");

  if (!classId) {
    return NextResponse.json({ error: "Class ID is required" }, { status: 400 });
  }

  if (!userId) {
    return NextResponse.json({ error: "User ID is required" }, { status: 401 });
  }

  try {
    // Get user to check role (pass userId as requesting user for role check)
    const user = await getUserById(userId, userId, null);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify class exists
    const cls = await getClassById(classId);
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    let assignments;

    if (user.role === "faculty") {
      // Faculty can see assignments for classes they created
      if (cls.facultyId !== userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      assignments = await getAssignmentsByClass(classId);
    } else if (user.role === "student") {
      // Students can see assignments for classes they're enrolled in
      if (!cls.studentIds.includes(userId)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      assignments = await getAssignmentsByClass(classId);
    } else {
      return NextResponse.json({ error: "Invalid user role" }, { status: 403 });
    }

    // Format assignments with PDF URLs
    const formattedAssignments = assignments.map(assignment => ({
      id: assignment.id,
      name: assignment.name,
      pdfUrl: `/api/classes/assignments/download?classId=${classId}&assignmentId=${assignment.id}`,
      dueDate: assignment.dueDate.toISOString(),
      canvasLink: assignment.canvasLink || "",
      createdAt: assignment.createdAt.toISOString()
    }));

    return NextResponse.json({ assignments: formattedAssignments });
  } catch (error) {
    console.error("Failed to list assignments:", error);
    return NextResponse.json({ error: "Failed to list assignments" }, { status: 500 });
  }
}

// POST: Create a new assignment (only faculty can create)
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const classId = formData.get("classId") as string;
    const name = formData.get("name") as string;
    const dueDate = formData.get("dueDate") as string;
    const canvasLink = formData.get("canvasLink") as string;
    const pdfFile = formData.get("pdf") as File;
    const userId = request.headers.get("x-user-id") || formData.get("userId") as string;

    if (!classId || !name || !dueDate || !pdfFile) {
      return NextResponse.json(
        { error: "Class ID, name, due date, and PDF file are required" },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 401 });
    }

    // Get user to verify they're faculty (pass userId as requesting user for role check)
    const user = await getUserById(userId, userId, null);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.role !== "faculty") {
      return NextResponse.json({ error: "Only faculty can create assignments" }, { status: 403 });
    }

    // Verify class exists and user is the faculty for this class
    const cls = await getClassById(classId);
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    if (cls.facultyId !== userId) {
      return NextResponse.json({ error: "Unauthorized: You can only create assignments for your own classes" }, { status: 403 });
    }

    const classAssignmentsDir = path.join(assignmentsDir, classId);
    ensureDirExists(classAssignmentsDir);

    // Generate unique ID for assignment
    const assignmentId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const safeFileName = pdfFile.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const pdfFileName = `${assignmentId}-${safeFileName}`;
    const pdfPath = path.join(classAssignmentsDir, pdfFileName);

    // Save PDF file
    const arrayBuffer = await pdfFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await promisify(fs.writeFile)(pdfPath, buffer);

    // Create assignment in database
    const assignment = await createAssignment({
      classId,
      facultyId: userId,
      name,
      dueDate: new Date(dueDate),
      canvasLink: canvasLink || undefined,
      pdfFileName
    });

    return NextResponse.json({
      success: true,
      assignment: {
        id: assignment.id,
        name: assignment.name,
        pdfUrl: `/api/classes/assignments/download?classId=${classId}&assignmentId=${assignment.id}`,
        dueDate: assignment.dueDate.toISOString(),
        canvasLink: assignment.canvasLink || "",
        createdAt: assignment.createdAt.toISOString()
      }
    });
  } catch (error) {
    console.error("Failed to create assignment:", error);
    return NextResponse.json({ error: "Failed to create assignment" }, { status: 500 });
  }
}

// DELETE: Delete an assignment (only faculty who created it can delete)
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("classId");
  const assignmentId = searchParams.get("assignmentId");
  const userId = request.headers.get("x-user-id") || searchParams.get("userId");

  if (!classId || !assignmentId) {
    return NextResponse.json(
      { error: "Class ID and assignment ID are required" },
      { status: 400 }
    );
  }

  if (!userId) {
    return NextResponse.json({ error: "User ID is required" }, { status: 401 });
  }

  try {
    // Get assignment from database
    const assignment = await getAssignmentById(assignmentId);
    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    // Verify assignment belongs to the specified class
    if (assignment.classId !== classId) {
      return NextResponse.json({ error: "Assignment not found for this class" }, { status: 404 });
    }

    // Get user to verify they're faculty and created this assignment (pass userId as requesting user for role check)
    const user = await getUserById(userId, userId, null);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.role !== "faculty") {
      return NextResponse.json({ error: "Only faculty can delete assignments" }, { status: 403 });
    }

    // Only the faculty who created the assignment can delete it
    if (assignment.facultyId !== userId) {
      return NextResponse.json({ error: "Unauthorized: You can only delete assignments you created" }, { status: 403 });
    }

    // Delete PDF file from file system
    const classAssignmentsDir = path.join(assignmentsDir, classId);
    const filePath = path.join(classAssignmentsDir, assignment.pdfFileName);
    
    if (fs.existsSync(filePath)) {
      await promisify(fs.unlink)(filePath);
    }

    // Delete assignment from database
    const client = await pool.connect();
    try {
      await client.query('DELETE FROM assignments WHERE id = $1', [assignmentId]);
    } finally {
      client.release();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete assignment:", error);
    return NextResponse.json({ error: "Failed to delete assignment" }, { status: 500 });
  }
}
