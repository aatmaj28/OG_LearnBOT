/**
 * WebSocket Service for Real-time Task Updates
 * Handles real-time communication for async task processing
 */

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import * as amqp from 'amqplib';

interface TaskUpdate {
  taskId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
  result?: any;
  error?: string;
  timestamp: number;
}

class WebSocketService {
  private io: SocketIOServer | null = null;
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private readonly RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://essaybot:essaybot123@localhost:5672';

  async initialize(httpServer: HTTPServer): Promise<void> {
    try {
      console.log('🔌 Initializing WebSocket service...');
      
      // Initialize Socket.IO
      this.io = new SocketIOServer(httpServer, {
        cors: {
          origin: process.env.FRONTEND_URL || "http://localhost:3000",
          methods: ["GET", "POST"]
        }
      });

      // Connect to RabbitMQ for notifications
      await this.connectToRabbitMQ();
      
      // Set up Socket.IO event handlers
      this.setupSocketHandlers();
      
      console.log('✅ WebSocket service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize WebSocket service:', error);
      throw error;
    }
  }

  private async connectToRabbitMQ(): Promise<void> {
    try {
      this.connection = await amqp.connect(this.RABBITMQ_URL) as any;
      this.channel = await (this.connection as any).createChannel();
      
      if (!this.channel) {
        throw new Error('Failed to create RabbitMQ channel');
      }
      
      // Set up environment-specific notification queue consumer
      const namespace = process.env.NAMESPACE || 'uat';
      const queueSuffix = namespace === 'prod' ? '' : '-uat';
      const notificationsQueue = `essay.notifications${queueSuffix}`;
      
      await this.channel.assertQueue(notificationsQueue, { durable: true });
      
      // Consume notifications and broadcast to WebSocket clients
      await this.channel.consume(notificationsQueue, (msg) => {
        if (msg && this.channel) {
          try {
            const notification = JSON.parse(msg.content.toString());
            this.broadcastTaskUpdate(notification);
            this.channel.ack(msg);
          } catch (error) {
            console.error('❌ Failed to process notification:', error);
            this.channel.nack(msg, false, false);
          }
        }
      });
      
      console.log('✅ Connected to RabbitMQ for notifications');
    } catch (error) {
      console.error('❌ Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  private setupSocketHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket) => {
      console.log(`🔌 Client connected: ${socket.id}`);

      // Handle task subscription
      socket.on('subscribe-task', (taskId: string) => {
        socket.join(`task-${taskId}`);
        console.log(`📡 Client ${socket.id} subscribed to task ${taskId}`);
      });

      // Handle task unsubscription
      socket.on('unsubscribe-task', (taskId: string) => {
        socket.leave(`task-${taskId}`);
        console.log(`📡 Client ${socket.id} unsubscribed from task ${taskId}`);
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
      });
    });
  }

  public broadcastTaskUpdate(update: TaskUpdate): void {
    if (!this.io) return;

    try {
      // Broadcast to all clients subscribed to this task
      this.io.to(`task-${update.taskId}`).emit('task-update', update);
      console.log(`📢 Broadcasted update for task ${update.taskId}: ${update.status}`);
    } catch (error) {
      console.error('❌ Failed to broadcast task update:', error);
    }
  }

  // Method to send task update to specific user
  sendTaskUpdateToUser(userId: string, update: TaskUpdate): void {
    if (!this.io) return;

    try {
      this.io.to(`user-${userId}`).emit('task-update', update);
      console.log(`📢 Sent task update to user ${userId}: ${update.taskId}`);
    } catch (error) {
      console.error('❌ Failed to send task update to user:', error);
    }
  }

  // Method to get connected clients count
  getConnectedClientsCount(): number {
    return this.io?.engine?.clientsCount || 0;
  }

  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await (this.connection as any).close();
      }
      if (this.io) {
        this.io.close();
      }
      console.log('🔌 WebSocket service disconnected');
    } catch (error) {
      console.error('❌ Error disconnecting WebSocket service:', error);
    }
  }
}

// Singleton instance
export const websocketService = new WebSocketService();
