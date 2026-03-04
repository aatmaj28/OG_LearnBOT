import { Request, Response } from "express";
import { Assignment } from "../../models/Assignment";
import { queueService } from "../../services/queueService";
import { redisService } from "../../services/redisService";

interface AuthenticatedRequest extends Request {
  user: { id: string; username: string };
}

export const createRubricAsync = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { courseId, question, assignmentId, model } = req.body;
    const username = req.user?.username;

    if (!courseId || !question || !assignmentId || !username) {
      return res.status(400).json({
        message:
          "Missing required fields: courseId, assignmentId, question, or username",
      });
    }

    const assignment = await Assignment.findOne({ _id: assignmentId, course: courseId });
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    const taskData = {
      courseId,
      question,
      assignmentId,
      username,
      model,
      guidelines: assignment.guidelines || "",
    };

    const taskId = await queueService.publishTask(
      "generate-rubric",
      taskData,
      username
    );

    await redisService.storeTaskResult(taskId, {
      taskId,
      status: "queued",
      createdAt: Date.now(),
    });

    return res.status(202).json({
      message: "Rubric generation task queued",
      taskId,
      status: "queued",
    });
  } catch (err) {
    console.error("Error queueing rubric generation:", err);
    return res.status(500).json({ message: "Failed to queue rubric generation" });
  }
};



