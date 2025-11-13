import { type NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { promisify } from "util";
import { getAssignmentById, getClassById } from "@/lib/db-service";
import { getUserById } from "@/lib/db-service";

const assignmentsDir = path.join(process.cwd(), "assignments");

export async function GET(request: NextRequest) {
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

    // Get user to check access
    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get class to verify access
    const cls = await getClassById(classId);
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    // Access control: Faculty who created the assignment or students enrolled in the class
    if (user.role === "faculty") {
      if (assignment.facultyId !== userId && cls.facultyId !== userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    } else if (user.role === "student") {
      if (!cls.studentIds.includes(userId)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    } else {
      return NextResponse.json({ error: "Invalid user role" }, { status: 403 });
    }

    // Find and serve the PDF file
    const classAssignmentsDir = path.join(assignmentsDir, classId);
    const filePath = path.join(classAssignmentsDir, assignment.pdfFileName);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "PDF file not found" }, { status: 404 });
    }

    const fileBuffer = await promisify(fs.readFile)(filePath);
    const originalFileName = assignment.pdfFileName.replace(/^\d+-/, ""); // Remove assignment ID prefix

    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", `attachment; filename="${originalFileName}"`);

    return new NextResponse(fileBuffer, { headers });
  } catch (error) {
    console.error("Failed to download assignment:", error);
    return NextResponse.json({ error: "Failed to download assignment" }, { status: 500 });
  }
}
