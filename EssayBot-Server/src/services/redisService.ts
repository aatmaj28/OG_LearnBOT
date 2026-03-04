/**
 * Barebones Redis Service for Task Results
 * Handles task result storage for 100 users
 */

import Redis from 'ioredis';

interface TaskResult {
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

class RedisService {
  private redis: Redis | null = null;
  private readonly REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

  async connect(): Promise<void> {
    try {
      console.log('🔌 Connecting to Redis...');
      this.redis = new Redis(this.REDIS_URL, {
        lazyConnect: true,
        connectTimeout: 10000,
        commandTimeout: 5000,
        maxRetriesPerRequest: 3
      });

      await this.redis.connect();
      console.log('✅ Connected to Redis');
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
      throw error;
    }
  }

  async storeTaskResult(taskId: string, result: TaskResult): Promise<void> {
    if (!this.redis) {
      throw new Error('Redis service not connected');
    }

    try {
      const key = `task:${taskId}`;
      await this.redis.setex(key, 3600, JSON.stringify(result)); // 1 hour TTL
      console.log(`💾 Stored result for task ${taskId}`);
    } catch (error) {
      console.error('❌ Failed to store task result:', error);
      throw error;
    }
  }

  async getTaskResult(taskId: string): Promise<TaskResult | null> {
    if (!this.redis) {
      throw new Error('Redis service not connected');
    }

    try {
      const key = `task:${taskId}`;
      const result = await this.redis.get(key);
      
      if (!result) {
        return null;
      }

      return JSON.parse(result) as TaskResult;
    } catch (error) {
      console.error('❌ Failed to get task result:', error);
      return null;
    }
  }

  async updateTaskStatus(taskId: string, status: TaskResult['status'], data?: any): Promise<void> {
    if (!this.redis) {
      throw new Error('Redis service not connected');
    }

    try {
      const key = `task:${taskId}`;
      const existing = await this.getTaskResult(taskId);
      
      if (!existing) {
        throw new Error(`Task ${taskId} not found`);
      }

      const updated: TaskResult = {
        ...existing,
        status,
        ...data,
        completedAt: status === 'completed' || status === 'failed' ? Date.now() : existing.completedAt
      };

      await this.redis.setex(key, 3600, JSON.stringify(updated));
      console.log(`🔄 Updated task ${taskId} status to ${status}`);
    } catch (error) {
      console.error('❌ Failed to update task status:', error);
      throw error;
    }
  }

  async deleteTaskResult(taskId: string): Promise<void> {
    if (!this.redis) {
      throw new Error('Redis service not connected');
    }

    try {
      const key = `task:${taskId}`;
      await this.redis.del(key);
      console.log(`🗑️ Deleted task ${taskId} result`);
    } catch (error) {
      console.error('❌ Failed to delete task result:', error);
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.redis) {
        await this.redis.disconnect();
      }
      console.log('🔌 Disconnected from Redis');
    } catch (error) {
      console.error('❌ Error disconnecting from Redis:', error);
    }
  }
}

// Singleton instance
export const redisService = new RedisService();
