import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { BulkOperationService } from './BulkOperationService';
import { BulkOperationProgress } from '@/types/bulk';

export class WebSocketService {
  private io: SocketIOServer;
  private bulkOperationService: BulkOperationService;

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
      }
    });

    this.bulkOperationService = new BulkOperationService();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket) => {
      console.log('Client connected to WebSocket:', socket.id);

      // Join user-specific room for progress updates
      socket.on('join-user-room', (userId: string) => {
        socket.join(`user-${userId}`);
        console.log(`User ${userId} joined room`);
      });

      // Subscribe to operation progress
      socket.on('subscribe-operation', (data: { operationId: string; userId: string }) => {
        const { operationId, userId } = data;
        
        // Verify user owns this operation
        const userOperations = this.bulkOperationService.getActiveOperations(userId);
        if (userOperations.includes(operationId)) {
          socket.join(`operation-${operationId}`);
          
          // Subscribe to progress updates
          this.bulkOperationService.subscribeToProgress(operationId, (progress: BulkOperationProgress) => {
            socket.emit('operation-progress', progress);
          });

          // Send current progress immediately
          const currentProgress = this.bulkOperationService.getProgress(operationId);
          if (currentProgress) {
            socket.emit('operation-progress', currentProgress);
          }
        } else {
          socket.emit('error', { message: 'Unauthorized to access this operation' });
        }
      });

      // Unsubscribe from operation progress
      socket.on('unsubscribe-operation', (operationId: string) => {
        socket.leave(`operation-${operationId}`);
        console.log(`Client ${socket.id} unsubscribed from operation ${operationId}`);
      });

      // Cancel operation
      socket.on('cancel-operation', (data: { operationId: string; userId: string }) => {
        const { operationId, userId } = data;
        
        // Verify user owns this operation
        const userOperations = this.bulkOperationService.getActiveOperations(userId);
        if (userOperations.includes(operationId)) {
          const cancelled = this.bulkOperationService.cancelOperation(operationId);
          
          if (cancelled) {
            socket.emit('operation-cancelled', { operationId });
            // Broadcast to all clients in operation room
            this.io.to(`operation-${operationId}`).emit('operation-cancelled', { operationId });
          } else {
            socket.emit('error', { message: 'Failed to cancel operation' });
          }
        } else {
          socket.emit('error', { message: 'Unauthorized to cancel this operation' });
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log('Client disconnected from WebSocket:', socket.id);
      });
    });
  }

  /**
   * Broadcast progress update to all subscribed clients
   */
  broadcastProgressUpdate(progress: BulkOperationProgress): void {
    this.io.to(`operation-${progress.operationId}`).emit('operation-progress', progress);
  }

  /**
   * Send notification to specific user
   */
  sendToUser(userId: string, event: string, data: any): void {
    this.io.to(`user-${userId}`).emit(event, data);
  }

  /**
   * Get number of connected clients
   */
  getConnectedClientsCount(): number {
    return this.io.engine.clientsCount;
  }

  /**
   * Get rooms for a specific socket
   */
  getSocketRooms(socketId: string): Promise<string[]> {
    return new Promise((resolve) => {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        resolve(Array.from(socket.rooms));
      } else {
        resolve([]);
      }
    });
  }
}
