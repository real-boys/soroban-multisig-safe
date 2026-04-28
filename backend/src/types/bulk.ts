export interface BulkOperationRequest<T> {
  items: T[];
  options?: BulkOperationOptions;
}

export interface BulkOperationOptions {
  continueOnError?: boolean;
  maxConcurrency?: number;
  timeoutMs?: number;
  validateBeforeExecute?: boolean;
}

export interface BulkOperationResult<T> {
  successful: T[];
  failed: BulkOperationError[];
  totalProcessed: number;
  operationId: string;
  duration: number;
}

export interface BulkOperationError {
  item: any;
  error: string;
  code: string;
  index: number;
}

export interface BulkOperationProgress {
  operationId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  totalItems: number;
  processedItems: number;
  successfulItems: number;
  failedItems: number;
  percentage: number;
  estimatedTimeRemaining?: number;
  startedAt: Date;
  updatedAt: Date;
  errors: BulkOperationError[];
}

// Wallet bulk operation types
export interface BulkCreateWalletRequest {
  name: string;
  owners: string[];
  threshold: number;
  recoveryAddress: string;
  recoveryDelay: number;
}

export interface BulkUpdateWalletRequest {
  id: string;
  name?: string;
  threshold?: number;
  recoveryAddress?: string;
  recoveryDelay?: number;
}

export interface BulkDeleteWalletRequest {
  id: string;
}

// Transaction bulk operation types
export interface BulkCreateTransactionRequest {
  walletId: string;
  destination: string;
  amount: string;
  data?: string;
  title: string;
  description: string;
  expiresAt: string;
}

export interface BulkUpdateTransactionRequest {
  id: string;
  title?: string;
  description?: string;
}

export interface BulkDeleteTransactionRequest {
  id: string;
}

// Comment bulk operation types
export interface BulkCreateCommentRequest {
  transactionId: string;
  content: string;
}

export interface BulkDeleteCommentRequest {
  id: string;
}

// Owner bulk operation types
export interface BulkAddOwnerRequest {
  walletId: string;
  ownerAddress: string;
}

export interface BulkRemoveOwnerRequest {
  walletId: string;
  ownerAddress: string;
}

// Progress tracking types
export interface ProgressCallback {
  (progress: BulkOperationProgress): void;
}

export interface BulkOperationContext {
  userId: string;
  operationId: string;
  startTime: Date;
  progressCallbacks: ProgressCallback[];
  cancellationToken: { cancelled: boolean };
}

// Database transaction types
export interface BulkTransactionOptions {
  isolationLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
  timeout?: number;
  maxRetries?: number;
}

// Validation types
export interface BulkValidationResult<T> {
  valid: T[];
  invalid: BulkValidationError[];
}

export interface BulkValidationError {
  item: T;
  errors: string[];
  index: number;
}

// Response types for API
export interface BulkOperationResponse {
  operationId: string;
  status: string;
  message: string;
  result?: BulkOperationResult<any>;
  progress?: BulkOperationProgress;
}
