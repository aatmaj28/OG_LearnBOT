/**
 * WebSocket Client for Real-time Task Updates
 * Provides real-time updates for async task processing
 */

export interface TaskUpdate {
  taskId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
  result?: any;
  error?: string;
  timestamp: number;
}

export interface WebSocketClientOptions {
  serverUrl?: string;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export class WebSocketClient {
  private socket: WebSocket | null = null;
  private options: Required<WebSocketClientOptions>;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private taskSubscriptions: Set<string> = new Set();
  private listeners: Map<string, ((update: TaskUpdate) => void)[]> = new Map();

  constructor(options: WebSocketClientOptions = {}) {
    this.options = {
      serverUrl: options.serverUrl || 'ws://localhost:8002',
      autoReconnect: options.autoReconnect !== false,
      reconnectInterval: options.reconnectInterval || 3000,
      maxReconnectAttempts: options.maxReconnectAttempts || 10
    };
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(this.options.serverUrl);

        this.socket.onopen = () => {
          console.log('🔌 WebSocket connected');
          this.reconnectAttempts = 0;
          
          // Re-subscribe to all tasks
          this.taskSubscriptions.forEach(taskId => {
            this.subscribeToTask(taskId);
          });
          
          resolve();
        };

        this.socket.onmessage = (event) => {
          try {
            const update: TaskUpdate = JSON.parse(event.data);
            this.handleTaskUpdate(update);
          } catch (error) {
            console.error('❌ Failed to parse WebSocket message:', error);
          }
        };

        this.socket.onclose = () => {
          console.log('🔌 WebSocket disconnected');
          this.socket = null;
          
          if (this.options.autoReconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        };

        this.socket.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          reject(error);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.options.maxReconnectAttempts})...`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(error => {
        console.error('❌ Reconnection failed:', error);
      });
    }, this.options.reconnectInterval);
  }

  subscribeToTask(taskId: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, will subscribe when connected');
      this.taskSubscriptions.add(taskId);
      return;
    }

    this.socket.send(JSON.stringify({
      type: 'subscribe-task',
      taskId
    }));
    
    this.taskSubscriptions.add(taskId);
    console.log(`📡 Subscribed to task ${taskId}`);
  }

  unsubscribeFromTask(taskId: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.taskSubscriptions.delete(taskId);
      return;
    }

    this.socket.send(JSON.stringify({
      type: 'unsubscribe-task',
      taskId
    }));
    
    this.taskSubscriptions.delete(taskId);
    console.log(`📡 Unsubscribed from task ${taskId}`);
  }

  onTaskUpdate(taskId: string, callback: (update: TaskUpdate) => void): void {
    if (!this.listeners.has(taskId)) {
      this.listeners.set(taskId, []);
    }
    this.listeners.get(taskId)!.push(callback);
  }

  offTaskUpdate(taskId: string, callback: (update: TaskUpdate) => void): void {
    const callbacks = this.listeners.get(taskId);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private handleTaskUpdate(update: TaskUpdate): void {
    const callbacks = this.listeners.get(update.taskId);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(update);
        } catch (error) {
          console.error('❌ Error in task update callback:', error);
        }
      });
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    
    this.taskSubscriptions.clear();
    this.listeners.clear();
    console.log('🔌 WebSocket client disconnected');
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }
}

// Singleton instance for global use
let globalWebSocketClient: WebSocketClient | null = null;

export function getWebSocketClient(): WebSocketClient {
  if (!globalWebSocketClient) {
    globalWebSocketClient = new WebSocketClient();
  }
  return globalWebSocketClient;
}

// Utility function for easy task monitoring
export function monitorTask(
  taskId: string,
  onUpdate: (update: TaskUpdate) => void,
  options: WebSocketClientOptions = {}
): WebSocketClient {
  const client = new WebSocketClient(options);
  
  client.connect().then(() => {
    client.subscribeToTask(taskId);
    client.onTaskUpdate(taskId, onUpdate);
  }).catch(error => {
    console.error('❌ Failed to connect WebSocket client:', error);
  });
  
  return client;
}
