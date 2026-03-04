import { Request, Response } from "express";
import { Types } from "mongoose";
import { Assignment } from "../../models/Assignment";
import { Course } from "../../models/Course";
import { GradingStats } from "../../models/GradingStats";
import { GradingHistory } from "../../models/GradingHistory";
import { queueService } from "../../services/queueService";
import { redisService } from "../../services/redisService";
import { websocketService } from "../../services/websocketService";

// Generate MinIO-safe timestamp (matches bulkGrading.ts)
const generateMinioSafeTimestamp = (): string => {
  const now = new Date();
  return now
    .toISOString()
    .replace(/T/g, "-") // Replace T with hyphen
    .replace(/:/g, "-") // Replace colons with hyphens
    .replace(/\./g, "-") // Replace dots with hyphens
    .replace(/Z/g, "") // Remove Z
    .slice(0, 19); // Take only YYYY-MM-DD-HH-mm-ss part
};

export const gradeBulkEssaysAsync = async (req: Request, res: Response): Promise<void> => {
  try {
    const { courseId, assignmentId, model, tone } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ error: "User not authenticated" });
      return;
    }

    // Validate required fields
    if (!courseId || !assignmentId) {
      res.status(400).json({ 
        error: "courseId and assignmentId are required" 
      });
      return;
    }

    // Find assignment and course
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    const course = await Course.findById(courseId);
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    // Validate assignment belongs to course
    if (assignment.course.toString() !== courseId) {
      res.status(400).json({ 
        error: "Assignment does not belong to the specified course" 
      });
      return;
    }

    // Check if assignment has required data
    if (!assignment.config_rubric || !assignment.config_rubric.criteria) {
      res.status(400).json({ 
        error: "Assignment rubric configuration is incomplete" 
      });
      return;
    }

    // Get the most recently uploaded Excel file
    const mostRecentExcelFile = assignment.excelFiles && assignment.excelFiles.length > 0 
      ? assignment.excelFiles.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0]
      : null;

    if (!mostRecentExcelFile) {
      res.status(400).json({ 
        error: "No Excel file found for this assignment. Please upload student responses first." 
      });
      return;
    }

    // Prepare task data for async processing
    const taskData = {
      courseId,
      assignmentId,
      assignmentTitle: assignment._id, // Use assignment ID, not title
      config_prompt: assignment.config_prompt,
      question: assignment.question,
      username: (req as any).user?.username || "unknown",
      s3_excel_link: mostRecentExcelFile.url,
      model: model || "google/gemma-3-27b-it",
      tone: tone || "moderate",
      gradingBrackets: assignment.config_rubric.gradingBrackets,
      criteria: assignment.config_rubric.criteria,
      userId,
      timestamp: new Date().toISOString()
    };

    // Publish task to RabbitMQ
    const taskId = await queueService.publishTask(
      "grade-bulk-essays",
      taskData,
      userId
    );

    // Create GradingHistory upfront when grading starts (to avoid race conditions)
    // This ensures we can link the correct history to the grading stats when it completes
    try {
      const gradingHistory = await GradingHistory.create({
        assignmentId: new Types.ObjectId(assignmentId),
        courseId: new Types.ObjectId(courseId),
        createdBy: new Types.ObjectId(userId),
        config_rubric: assignment.config_rubric,
        rubricName: assignment.title || "Untitled Rubric",
        version: 1,
        taskId: taskId, // Link this history to the task
      });
      console.log(`✅ Created GradingHistory ${gradingHistory._id} for task ${taskId}`);
    } catch (historyError: any) {
      // Log error but don't fail the request - we can still link by taskId later
      console.error(`⚠️ Failed to create GradingHistory for task ${taskId}:`, historyError);
    }

    // Store initial task status in Redis with metadata for later use
    await redisService.storeTaskResult(taskId, {
      taskId,
      status: "queued",
      result: {
        message: "Bulk grading task queued successfully",
        totalEssays: 0,
        completedEssays: 0,
        failedEssays: 0,
        userId
      },
      progress: 0,
      createdAt: Date.now(),
      // Store metadata needed for creating GradingStats later
      metadata: {
        courseId,
        assignmentId,
        userId,
        model: model || "google/gemma-3-27b-it",
        assignmentTitle: assignment.title
      }
    });

    console.log(`📋 Bulk grading task queued: ${taskId}`);

    res.status(202).json({
      taskId,
      message: "Bulk grading task submitted successfully",
      status: "queued",
      estimatedTime: "3-8 minutes depending on batch size (34 essays = ~12 batches of 3)",
      batchSize: 3,
      timeoutMinutes: 10
    });

  } catch (error: any) {
    console.error("Error in async bulk grading:", error);
    res.status(500).json({ 
      error: "Failed to submit bulk grading task",
      details: error.message 
    });
  }
};

export const getBulkGradingTaskResult = async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ error: "User not authenticated" });
      return;
    }

    // Get task result from Redis
    const taskResult = await redisService.getTaskResult(taskId);
    
    if (!taskResult) {
      res.status(404).json({ 
        error: "Task not found or expired" 
      });
      return;
    }

    // Check if task belongs to user (basic security)
    if (taskResult.result?.userId !== userId) {
      res.status(403).json({ 
        error: "Access denied to this task" 
      });
      return;
    }

    // If grading completed successfully, ensure GradingStats and GradingHistory are created/linked
    if (taskResult.status === 'completed' && taskResult.result?.s3_graded_link && taskResult.metadata) {
      const metadata = taskResult.metadata;
      
      console.log(`[getBulkGradingTaskResult] Task ${taskId} completed, checking for GradingStats creation. Metadata:`, {
        courseId: metadata.courseId,
        assignmentId: metadata.assignmentId,
        userId: metadata.userId,
        s3Link: taskResult.result.s3_graded_link
      });
      
      // IMPORTANT: This endpoint MUST be called after grading completes to trigger linking
      // The frontend WebSocket handler should call this, but we also handle it here as a safety net
      
      if (metadata.courseId && metadata.assignmentId && metadata.userId) {
        try {
          // Check if GradingStats already exists for this task (avoid duplicate creation)
          const existingStats = await GradingStats.findOne({
            courseId: new Types.ObjectId(metadata.courseId),
            assignmentId: new Types.ObjectId(metadata.assignmentId),
            'gradeFile.url': taskResult.result.s3_graded_link,
            createdBy: new Types.ObjectId(metadata.userId),
          });

          if (existingStats) {
            console.log(`[getBulkGradingTaskResult] GradingStats already exists: ${existingStats._id}, checking if linked to GradingHistory`);
            // Check if it's linked to a GradingHistory
            const linkedHistory = await GradingHistory.findOne({
              gradingStatsId: existingStats._id
            });
            if (linkedHistory) {
              console.log(`[getBulkGradingTaskResult] ✅ GradingStats ${existingStats._id} is already linked to GradingHistory ${linkedHistory._id}`);
            } else {
              console.log(`[getBulkGradingTaskResult] ⚠️ GradingStats ${existingStats._id} exists but is NOT linked to any GradingHistory - attempting to link now`);
              // Try to link it - first by taskId, then fallback
              let gradingHistory = await GradingHistory.findOne({
                taskId: taskId,
              });
              
              if (!gradingHistory) {
                // Fallback: find most recent unlinked history
                gradingHistory = await GradingHistory.findOne({
                  assignmentId: new Types.ObjectId(metadata.assignmentId),
                  courseId: new Types.ObjectId(metadata.courseId),
                  createdBy: new Types.ObjectId(metadata.userId),
                  gradingStatsId: { $exists: false },
                }).sort({ createdAt: -1 });
              }
              
              if (gradingHistory) {
                gradingHistory.gradingStatsId = existingStats._id as Types.ObjectId;
                if (!gradingHistory.taskId) {
                  gradingHistory.taskId = taskId; // Set taskId if it wasn't set
                }
                await gradingHistory.save();
                console.log(`[getBulkGradingTaskResult] ✅ Linked existing GradingStats ${existingStats._id} to GradingHistory ${gradingHistory._id} (taskId: ${taskId})`);
              } else {
                console.error(`[getBulkGradingTaskResult] ❌ Could not find GradingHistory to link GradingStats ${existingStats._id} to. This may cause reports to not appear.`);
              }
            }
          }

          if (!existingStats) {
            console.log(`📝 Creating GradingStats for completed async grading task ${taskId}`);
            
            const timestamp = generateMinioSafeTimestamp();
            const gradedFileName = `graded_${metadata.assignmentTitle || 'assignment'}_${timestamp}.xlsx`;

            // Create GradingStats record (matching sync behavior)
            const gradingStats = await GradingStats.create({
              courseId: new Types.ObjectId(metadata.courseId),
              assignmentId: new Types.ObjectId(metadata.assignmentId),
              modelName: metadata.model || "google/gemma-3-27b-it",
              gradeFile: {
                url: taskResult.result.s3_graded_link,
                originalName: gradedFileName,
                uploadedAt: new Date(),
              },
              totalEssays: taskResult.result.total_essays || 0,
              completedAt: new Date(),
              createdBy: new Types.ObjectId(metadata.userId),
            });

            // Find assignment to get config_rubric
            const assignment = await Assignment.findById(metadata.assignmentId);
            if (!assignment) {
              console.warn(`⚠️ Assignment ${metadata.assignmentId} not found when creating GradingStats`);
            } else {
              // Find GradingHistory by taskId (created when grading started)
              // This avoids race conditions when multiple gradings run simultaneously
              let gradingHistory = await GradingHistory.findOne({
                taskId: taskId,
              });

              // Fallback: if no history with taskId found, try the old method (for backward compatibility)
              if (!gradingHistory) {
                console.warn(`⚠️ No GradingHistory found with taskId ${taskId}, falling back to most recent without gradingStatsId`);
                gradingHistory = await GradingHistory.findOne({
                  assignmentId: new Types.ObjectId(metadata.assignmentId),
                  courseId: new Types.ObjectId(metadata.courseId),
                  createdBy: new Types.ObjectId(metadata.userId),
                  gradingStatsId: { $exists: false },
                }).sort({ createdAt: -1 });

                if (!gradingHistory) {
                  // If still no history, create a new one for this user
                  gradingHistory = await GradingHistory.create({
                    assignmentId: new Types.ObjectId(metadata.assignmentId),
                    courseId: new Types.ObjectId(metadata.courseId),
                    createdBy: new Types.ObjectId(metadata.userId),
                    config_rubric: assignment.config_rubric,
                    rubricName: assignment.title || "Untitled Rubric",
                    version: 1,
                    taskId: taskId, // Set taskId for future reference
                  });
                }
              }

              // Link the GradingStats to this GradingHistory
              gradingHistory.gradingStatsId = gradingStats._id as Types.ObjectId;
              gradingHistory.config_rubric = assignment.config_rubric as any; // Update rubric in case it changed
              if (!gradingHistory.taskId) {
                gradingHistory.taskId = taskId; // Set taskId if it wasn't set
              }
              await gradingHistory.save();

              console.log(`✅ Created GradingStats ${gradingStats._id} and linked to GradingHistory ${gradingHistory._id} (taskId: ${taskId})`);
            }
          }
        } catch (statsError: any) {
          // Log error but don't fail the request
          console.error(`❌ Failed to create GradingStats for task ${taskId}:`, statsError);
        }
      }
    }

    res.json(taskResult);

  } catch (error: any) {
    console.error("Error getting bulk grading task result:", error);
    res.status(500).json({ 
      error: "Failed to get task result",
      details: error.message 
    });
  }
};

export const updateBulkGradingProgress = async (req: Request, res: Response): Promise<void> => {
  try {
    // This is an internal endpoint - allow requests from localhost without auth
    // Check if request is from localhost (internal worker call)
    const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1' || 
                        req.headers.host?.includes('localhost') || 
                        req.headers['x-forwarded-for']?.includes('127.0.0.1');
    
    if (!isLocalhost) {
      console.warn(`[updateBulkGradingProgress] ⚠️ Request from non-localhost IP: ${req.ip}, host: ${req.headers.host}`);
      // Still allow but log warning - in production you might want to add API key check
    }

    const { taskId, status, progress, message, result, timestamp } = req.body;

    console.log(`[updateBulkGradingProgress] Received request for task ${taskId}, status: ${status}, from IP: ${req.ip}`);
    console.log(`[updateBulkGradingProgress] Result structure:`, {
      hasResult: !!result,
      hasS3Link: !!result?.s3_graded_link,
      s3Link: result?.s3_graded_link,
      resultKeys: result ? Object.keys(result) : []
    });

    if (!taskId) {
      res.status(400).json({ error: "taskId is required" });
      return;
    }

    // Get existing task data to preserve metadata
    const existingTask = await redisService.getTaskResult(taskId);
    const metadata = existingTask?.metadata || {};

    console.log(`[updateBulkGradingProgress] Metadata:`, {
      hasCourseId: !!metadata.courseId,
      hasAssignmentId: !!metadata.assignmentId,
      hasUserId: !!metadata.userId
    });

    // Update task status in Redis (preserve metadata)
    await redisService.storeTaskResult(taskId, {
      taskId,
      status: status || 'processing',
      result: result || {},
      progress: progress || 0,
      createdAt: existingTask?.createdAt || Date.now(),
      metadata // Preserve metadata
    });

    // If grading completed successfully, create GradingStats and link to GradingHistory
    if (status === 'completed' && result?.s3_graded_link && metadata.courseId && metadata.assignmentId && metadata.userId) {
      console.log(`[updateBulkGradingProgress] ✅ All conditions met, proceeding with GradingStats creation and linking`);
      try {
        console.log(`📝 Creating GradingStats for completed async grading task ${taskId}`);
        
        const timestamp = generateMinioSafeTimestamp();
        const gradedFileName = `graded_${metadata.assignmentTitle || 'assignment'}_${timestamp}.xlsx`;

        // Create GradingStats record (matching sync behavior)
        const gradingStats = await GradingStats.create({
          courseId: new Types.ObjectId(metadata.courseId),
          assignmentId: new Types.ObjectId(metadata.assignmentId),
          modelName: metadata.model || "google/gemma-3-27b-it",
          gradeFile: {
            url: result.s3_graded_link,
            originalName: gradedFileName,
            uploadedAt: new Date(),
          },
          totalEssays: result.total_essays || 0,
          completedAt: new Date(),
          createdBy: new Types.ObjectId(metadata.userId),
        });

        // Find assignment to get config_rubric
        const assignment = await Assignment.findById(metadata.assignmentId);
        if (!assignment) {
          console.warn(`⚠️ Assignment ${metadata.assignmentId} not found when creating GradingStats`);
        } else {
          // Find GradingHistory by taskId (created when grading started)
          // This avoids race conditions when multiple gradings run simultaneously
          let gradingHistory = await GradingHistory.findOne({
            taskId: taskId,
          });

          // Fallback: if no history with taskId found, try the old method (for backward compatibility)
          if (!gradingHistory) {
            console.warn(`⚠️ No GradingHistory found with taskId ${taskId}, falling back to most recent without gradingStatsId`);
            gradingHistory = await GradingHistory.findOne({
              assignmentId: new Types.ObjectId(metadata.assignmentId),
              courseId: new Types.ObjectId(metadata.courseId),
              createdBy: new Types.ObjectId(metadata.userId),
              gradingStatsId: { $exists: false },
            }).sort({ createdAt: -1 });

            if (!gradingHistory) {
              // If still no history, create a new one for this user
              gradingHistory = await GradingHistory.create({
                assignmentId: new Types.ObjectId(metadata.assignmentId),
                courseId: new Types.ObjectId(metadata.courseId),
                createdBy: new Types.ObjectId(metadata.userId),
                config_rubric: assignment.config_rubric,
                rubricName: assignment.title || "Untitled Rubric",
                version: 1,
                taskId: taskId, // Set taskId for future reference
              });
            }
          }

          // Link the GradingStats to this GradingHistory
          gradingHistory.gradingStatsId = gradingStats._id as Types.ObjectId;
          gradingHistory.config_rubric = assignment.config_rubric as any; // Update rubric in case it changed
          if (!gradingHistory.taskId) {
            gradingHistory.taskId = taskId; // Set taskId if it wasn't set
          }
          await gradingHistory.save();

          console.log(`✅ Created GradingStats ${gradingStats._id} and linked to GradingHistory ${gradingHistory._id} (taskId: ${taskId})`);
        }
      } catch (statsError: any) {
        // Log error but don't fail the progress update
        console.error(`❌ Failed to create GradingStats for task ${taskId}:`, statsError);
      }
    } else {
      // Log why linking wasn't triggered
      const reasons = [];
      if (status !== 'completed') reasons.push(`status is '${status}' not 'completed'`);
      if (!result?.s3_graded_link) reasons.push(`result.s3_graded_link is missing`);
      if (!metadata.courseId) reasons.push(`metadata.courseId is missing`);
      if (!metadata.assignmentId) reasons.push(`metadata.assignmentId is missing`);
      if (!metadata.userId) reasons.push(`metadata.userId is missing`);
      console.log(`[updateBulkGradingProgress] ⚠️ Skipping GradingStats linking for task ${taskId}. Reasons: ${reasons.join(', ')}`);
    }

    // Broadcast update via WebSocket
    websocketService.broadcastTaskUpdate({
      taskId,
      status: status || 'processing',
      progress: progress || 0,
      result: result || {},
      error: undefined,
      timestamp: timestamp || Date.now()
    });

    console.log(`📊 Progress update for task ${taskId}: ${message || 'Processing...'}`);

    res.status(200).json({ success: true });

  } catch (error: any) {
    console.error("Error updating bulk grading progress:", error);
    res.status(500).json({ 
      error: "Failed to update progress",
      details: error.message 
    });
  }
};
