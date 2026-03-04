/**
 * Client-side Task Polling Service
 * Handles polling for async task results
 */


export interface TaskResult {
  taskId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  progress?: number;
  createdAt: number;
  completedAt?: number;
  updatedAt?: number;
  metadata?: {
    courseId?: string;
    assignmentId?: string;
    userId?: string;
    model?: string;
    assignmentTitle?: string;
    [key: string]: any;
  };
}

export interface PollingOptions {
  interval?: number; // Polling interval in ms (default: 500ms for fast updates)
  maxAttempts?: number; // Maximum polling attempts (default: 300 = 2.5 minutes)
  adaptiveInterval?: boolean; // Use adaptive polling based on task progress
  onUpdate?: (result: TaskResult) => void;
  onComplete?: (result: TaskResult) => void;
  onError?: (error: string) => void;
}

export class TaskPoller {
  private taskId: string;
  private options: Required<PollingOptions>;
  private intervalId: NodeJS.Timeout | null = null;
  private attempts: number = 0;
  private isPolling: boolean = false;
  private currentInterval: number;
  private lastProgress: number = 0;

  constructor(taskId: string, options: PollingOptions = {}) {
    this.taskId = taskId;
    this.options = {
      interval: options.interval || 500, // Faster default polling
      maxAttempts: options.maxAttempts || 300, // 2.5 minutes for fast polling
      adaptiveInterval: options.adaptiveInterval !== false, // Default to true
      onUpdate: options.onUpdate || (() => {}),
      onComplete: options.onComplete || (() => {}),
      onError: options.onError || (() => {})
    };
    this.currentInterval = this.options.interval;
  }

  async start(): Promise<void> {
    if (this.isPolling) {
      console.warn('TaskPoller is already running');
      return;
    }

    this.isPolling = true;
    this.attempts = 0;

    console.log(`🔄 Starting polling for task ${this.taskId}`);

    // Start polling immediately
    await this.poll();

    // Set up interval for subsequent polls
    this.intervalId = setInterval(async () => {
      await this.poll();
    }, this.options.interval);
  }

  private async poll(): Promise<void> {
    if (!this.isPolling || this.attempts >= this.options.maxAttempts) {
      this.stop();
      return;
    }

    this.attempts++;

    try {
      const response = await fetch(`/api/grading/task/${this.taskId}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result: TaskResult = await response.json();
      
      // Adaptive polling: adjust interval based on task progress
      if (this.options.adaptiveInterval) {
        this.adjustPollingInterval(result);
      }
      
      // Call update callback
      this.options.onUpdate(result);

      // Check if task is complete
      if (result.status === 'completed' || result.status === 'failed') {
        this.stop();
        this.options.onComplete(result);
        
        if (result.status === 'failed') {
          this.options.onError(result.error || 'Task failed');
        }
      }

    } catch (error) {
      console.error(`❌ Polling error for task ${this.taskId}:`, error);
      
      if (this.attempts >= this.options.maxAttempts) {
        this.stop();
        this.options.onError(`Polling failed after ${this.attempts} attempts`);
      }
    }
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isPolling = false;
    console.log(`🛑 Stopped polling for task ${this.taskId}`);
  }

  isActive(): boolean {
    return this.isPolling;
  }

  getAttempts(): number {
    return this.attempts;
  }

  private adjustPollingInterval(result: TaskResult): void {
    const progress = result.progress || 0;
    const status = result.status;
    
    // Adaptive polling strategy:
    // - Queued: Poll every 1 second (slow)
    // - Processing with progress: Poll every 500ms (fast)
    // - Processing without progress: Poll every 2 seconds (slow)
    // - Near completion (>90%): Poll every 200ms (very fast)
    
    let newInterval: number;
    
    if (status === 'queued') {
      newInterval = 1000; // 1 second for queued tasks
    } else if (status === 'processing') {
      if (progress > this.lastProgress) {
        // Progress is being made - poll faster
        newInterval = progress > 90 ? 200 : 500; // Very fast near completion
      } else {
        // No progress - poll slower
        newInterval = 2000; // 2 seconds when no progress
      }
    } else {
      newInterval = this.options.interval; // Default interval
    }
    
    // Only update interval if it changed significantly
    if (Math.abs(newInterval - this.currentInterval) > 100) {
      this.currentInterval = newInterval;
      this.lastProgress = progress;
      
      // Restart polling with new interval
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = setInterval(async () => {
          await this.poll();
        }, this.currentInterval);
      }
      
      console.log(`🔄 Adjusted polling interval to ${this.currentInterval}ms for task ${this.taskId}`);
    }
  }
}

// Utility function for easy task polling
export function pollTask(
  taskId: string, 
  options: PollingOptions = {}
): TaskPoller {
  const poller = new TaskPoller(taskId, options);
  poller.start();
  return poller;
}

// React hook for task polling (if using React)
// Note: This should be moved to the frontend/client codebase
export function useTaskPolling(taskId: string | null, options: PollingOptions = {}) {
  // This function requires React and should be implemented in the frontend
  throw new Error('useTaskPolling should be implemented in the frontend codebase');
}

