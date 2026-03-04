/**
 * Barebones RabbitMQ Producer Service
 * Handles task publishing for 100 users
 */

import * as amqp from 'amqplib';
import { v4 as uuidv4 } from 'uuid';

interface TaskData {
  taskId: string;
  type: 'grade-single-essay' | 'grade-bulk-essays' | 'index-content' | 'generate-rubric';
  data: any;
  userId: string;
  timestamp: number;
}

class QueueService {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private readonly RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://essaybot:essaybot123@localhost:5672';
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly RECONNECT_DELAY = 5000; // 5 seconds
  private reconnectTimer: NodeJS.Timeout | null = null;
  
  // Get environment-specific queue suffix (for scalability - separate UAT and PROD queues)
  private getQueueSuffix(): string {
    const namespace = process.env.NAMESPACE || 'uat';
    return namespace === 'prod' ? '' : '-uat';
  }

  async connect(): Promise<void> {
    try {
      console.log('🔌 Connecting to RabbitMQ...');
      // Store connection in local variable first to help TypeScript type narrowing
      const connection = await amqp.connect(this.RABBITMQ_URL);
      this.connection = connection as any; // Type assertion needed due to amqplib type definitions
      this.channel = await connection.createChannel();
      
      // Set up connection error handlers for automatic reconnection
      // TypeScript knows connection is not null here because we just assigned it
      connection.on('error', (err) => {
        console.error('❌ RabbitMQ connection error:', err);
        this.handleReconnect();
      });
      
      connection.on('close', () => {
        console.warn('⚠️ RabbitMQ connection closed');
        this.handleReconnect();
      });
      
      // Auto-create queues and exchanges (no separate script needed)
      await this.setupQueues();
      
      this.reconnectAttempts = 0; // Reset on successful connection
      console.log('✅ Connected to RabbitMQ');
    } catch (error) {
      console.error('❌ Failed to connect to RabbitMQ:', error);
      this.handleReconnect();
      throw error;
    }
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnectTimer) {
      return; // Already attempting to reconnect
    }

    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error(`❌ Max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.RECONNECT_DELAY * this.reconnectAttempts; // Exponential backoff
    
    console.log(`🔄 Attempting to reconnect to RabbitMQ (attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS}) in ${delay}ms...`);
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        // Clean up old connection
        if (this.channel) {
          try {
            await this.channel.close();
          } catch (e) {
            // Ignore errors when closing
          }
          this.channel = null;
        }
        if (this.connection) {
          try {
            await (this.connection as any).close();
          } catch (e) {
            // Ignore errors when closing
          }
          this.connection = null;
        }
        
        // Attempt to reconnect
        await this.connect();
      } catch (error) {
        console.error('❌ Reconnection failed:', error);
        // Will retry on next interval
      }
    }, delay);
  }

  private async setupQueues(): Promise<void> {
    if (!this.channel) return;

    try {
      const suffix = this.getQueueSuffix();
      const namespace = process.env.NAMESPACE || 'uat';
      console.log(`📋 Setting up queues for environment: ${namespace} (suffix: ${suffix || 'none'})...`);
      
      // Create exchanges (shared across environments)
      await this.channel.assertExchange('essay.grading', 'direct', { durable: true });
      await this.channel.assertExchange('essay.notifications', 'fanout', { durable: true });
      
      // Create environment-specific queues
      const gradingQueue = `essay.grading.queue${suffix}`;
      const deadQueue = `essay.grading.dead${suffix}`;
      const notificationsQueue = `essay.notifications${suffix}`;
      
      await this.channel.assertQueue(gradingQueue, { 
        durable: true,
        arguments: {
          'x-message-ttl': 3600000,  // 1 hour TTL
          'x-max-length': 1000       // Max 1000 messages
        }
      });
      
      await this.channel.assertQueue(deadQueue, { durable: true });
      await this.channel.assertQueue(notificationsQueue, { durable: true });
      
      // Bind queues to exchanges
      await this.channel.bindQueue(gradingQueue, 'essay.grading', 'grading');
      await this.channel.bindQueue(deadQueue, 'essay.grading', 'dead');
      await this.channel.bindQueue(notificationsQueue, 'essay.notifications', '');
      
      console.log(`✅ Queues created: ${gradingQueue}, ${deadQueue}, ${notificationsQueue}`);
    } catch (error) {
      console.error('❌ Failed to setup queues:', error);
      throw error;
    }
  }

  async publishTask(
    type: TaskData['type'],
    data: any,
    userId: string,
    taskId?: string
  ): Promise<string> {
    // Ensure we're connected before publishing
    if (!this.isConnected()) {
      console.log('🔄 Queue service not connected, attempting to connect...');
      try {
        await this.connect();
      } catch (error) {
        throw new Error(`Queue service not connected and reconnection failed: ${error}`);
      }
    }

    if (!this.channel) {
      throw new Error('Queue service channel not available');
    }

    const finalTaskId = taskId || uuidv4();
    const task: TaskData = {
      taskId: finalTaskId,
      type,
      data,
      userId,
      timestamp: Date.now()
    };

    try {
      // Publish to environment-specific grading queue
      const suffix = this.getQueueSuffix();
      const gradingQueue = `essay.grading.queue${suffix}`;
      const success = this.channel.sendToQueue(
        gradingQueue,
        Buffer.from(JSON.stringify(task)),
        {
          persistent: true,  // Survive server restarts
          messageId: finalTaskId,
          timestamp: task.timestamp
        }
      );

      if (!success) {
        throw new Error('Failed to publish task to queue');
      }

      console.log(`📤 Published task ${finalTaskId} to queue`);
      return finalTaskId;

    } catch (error: any) {
      // Check for channel/connection closed errors by name, message, or stack
      const isChannelClosed = 
        error?.name === 'IllegalOperationError' ||
        error?.message?.includes('Channel closed') || 
        error?.message?.includes('Connection closed') ||
        error?.message?.includes('CONNECTION_FORCED') ||
        error?.stack?.includes('Channel closed') ||
        error?.stack?.includes('CONNECTION_FORCED');
      
      if (isChannelClosed) {
        console.warn('⚠️ Channel/Connection closed, attempting to reconnect and retry...');
        console.warn(`   Error details: name=${error?.name}, message=${error?.message?.substring(0, 100)}`);
        
        // Clean up closed connection/channel
        this.connection = null;
        this.channel = null;
        
        try {
          // Wait a bit for RabbitMQ to be ready (in case it's restarting)
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          await this.connect();
          
          // Retry publishing after reconnection
          if (!this.channel) {
            throw new Error('Channel not available after reconnection');
          }
          
          // Type assertion needed because TypeScript can't track class property changes across async boundaries
          const channel = this.channel as amqp.Channel;
          const retrySuffix = this.getQueueSuffix();
          const retryGradingQueue = `essay.grading.queue${retrySuffix}`;
          const retrySuccess = channel.sendToQueue(
            retryGradingQueue,
            Buffer.from(JSON.stringify(task)),
            {
              persistent: true,
              messageId: finalTaskId,
              timestamp: task.timestamp
            }
          );
          
          if (!retrySuccess) {
            throw new Error('Failed to publish task to queue after reconnection');
          }
          
          console.log(`📤 Published task ${finalTaskId} to queue (after reconnection)`);
          return finalTaskId;
        } catch (retryError: any) {
          console.error('❌ Failed to publish task after reconnection:', retryError);
          throw new Error(`Failed to publish task after reconnection: ${retryError?.message || retryError}`);
        }
      }
      
      console.error('❌ Failed to publish task:', error);
      throw error;
    }
  }

  async publishNotification(taskId: string, status: string, data?: any): Promise<void> {
    // Ensure we're connected before publishing
    if (!this.isConnected()) {
      console.log('🔄 Queue service not connected, attempting to connect...');
      try {
        await this.connect();
      } catch (error) {
        console.error('❌ Failed to reconnect for notification:', error);
        return; // Don't throw, just log and return
      }
    }

    if (!this.channel) {
      console.error('❌ Queue service channel not available for notification');
      return;
    }

    const notification = {
      taskId,
      status,
      data,
      timestamp: Date.now()
    };

    try {
      const suffix = this.getQueueSuffix();
      this.channel.publish(
        'essay.notifications',
        '',
        Buffer.from(JSON.stringify(notification)),
        { persistent: true }
      );
      
      console.log(`📢 Published notification for task ${taskId}: ${status}`);
    } catch (error) {
      console.error('❌ Failed to publish notification:', error);
    }
  }

  isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }

  async disconnect(): Promise<void> {
    // Cancel any pending reconnection attempts
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await (this.connection as any).close();
      }
      this.channel = null;
      this.connection = null;
      console.log('🔌 Disconnected from RabbitMQ');
    } catch (error) {
      console.error('❌ Error disconnecting from RabbitMQ:', error);
    }
  }
}

// Singleton instance
export const queueService = new QueueService();
