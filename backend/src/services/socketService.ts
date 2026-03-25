import { Server, Socket } from 'socket.io';
import { logger } from '@/utils/logger';

export let io: Server;

export const setupSocketHandlers = (serverIo: Server) => {
  io = serverIo;
  io.on('connection', (socket: Socket) => {
    logger.info(`Client connected: ${socket.id}`);

    // Join room for specific wallet or transaction
    socket.on('join_wallet', (walletId: string) => {
      socket.join(`wallet:${walletId}`);
      logger.info(`Client ${socket.id} joined room wallet:${walletId}`);
    });

    socket.on('join_transaction', (transactionId: string) => {
      socket.join(`transaction:${transactionId}`);
      logger.info(`Client ${socket.id} joined room transaction:${transactionId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });
  });
};

/**
 * Emit transaction status update to relevant clients
 */
export const emitTransactionUpdate = (io: Server, transactionId: string, status: any) => {
  io.to(`transaction:${transactionId}`).emit('transaction_updated', {
    transactionId,
    ...status,
  });
};

/**
 * Emit notification to users of a wallet
 */
export const emitWalletNotification = (io: Server, walletId: string, notification: any) => {
  io.to(`wallet:${walletId}`).emit('notification', {
    walletId,
    ...notification,
  });
};
