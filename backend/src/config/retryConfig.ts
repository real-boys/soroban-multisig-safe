import { RetryConfig, RetryStrategy, JitterType, CircuitBreakerConfig } from '@/types/retry';

/**
 * Default retry configurations for different operation types
 */

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  strategy: RetryStrategy.EXPONENTIAL,
  jitterType: JitterType.FULL,
  backoffMultiplier: 2,
  timeout: 10000, // 10 seconds per attempt
};

export const RPC_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  initialDelay: 500,
  maxDelay: 10000,
  strategy: RetryStrategy.EXPONENTIAL,
  jitterType: JitterType.FULL,
  backoffMultiplier: 2,
  timeout: 5000,
  retryableErrors: [
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ENETUNREACH',
    'EAI_AGAIN',
    'ECONNRESET',
    'EPIPE',
    'NETWORK_ERROR',
    'TIMEOUT',
    '429', // Too Many Requests
    '500', // Internal Server Error
    '502', // Bad Gateway
    '503', // Service Unavailable
    '504', // Gateway Timeout
  ],
  nonRetryableErrors: [
    '400', // Bad Request
    '401', // Unauthorized
    '403', // Forbidden
    '404', // Not Found
    '422', // Unprocessable Entity
    'INVALID_PARAMS',
    'VALIDATION_ERROR',
  ],
};

export const DATABASE_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 5000,
  strategy: RetryStrategy.EXPONENTIAL,
  jitterType: JitterType.EQUAL,
  backoffMultiplier: 2,
  timeout: 15000,
  retryableErrors: [
    'P1001', // Can't reach database server
    'P1002', // Database server timeout
    'P1008', // Operations timed out
    'P1017', // Server has closed the connection
    'P2024', // Timed out fetching a new connection
    'ECONNREFUSED',
    'ETIMEDOUT',
  ],
  nonRetryableErrors: [
    'P2002', // Unique constraint violation
    'P2003', // Foreign key constraint violation
    'P2025', // Record not found
  ],
};

export const EVENT_INDEXER_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 10,
  initialDelay: 2000,
  maxDelay: 60000, // 1 minute
  strategy: RetryStrategy.EXPONENTIAL,
  jitterType: JitterType.DECORRELATED,
  backoffMultiplier: 1.5,
  timeout: 30000,
  retryableErrors: [
    'NETWORK_ERROR',
    'TIMEOUT',
    'RATE_LIMIT',
    '429',
    '500',
    '502',
    '503',
    '504',
  ],
};

export const TRANSACTION_SUBMISSION_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  initialDelay: 2000,
  maxDelay: 30000,
  strategy: RetryStrategy.EXPONENTIAL,
  jitterType: JitterType.FULL,
  backoffMultiplier: 2,
  timeout: 20000,
  retryableErrors: [
    'TIMEOUT',
    'NETWORK_ERROR',
    'TX_TOO_LATE',
    'TX_INSUFFICIENT_FEE',
    '503',
    '504',
  ],
  nonRetryableErrors: [
    'TX_BAD_AUTH',
    'TX_BAD_SEQ',
    'TX_MALFORMED',
    'TX_FAILED',
    'INVALID_SIGNATURE',
  ],
};

export const EMAIL_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  initialDelay: 5000,
  maxDelay: 300000, // 5 minutes
  strategy: RetryStrategy.EXPONENTIAL,
  jitterType: JitterType.FULL,
  backoffMultiplier: 3,
  timeout: 10000,
};

export const WEBHOOK_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 7,
  initialDelay: 1000,
  maxDelay: 120000, // 2 minutes
  strategy: RetryStrategy.FIBONACCI,
  jitterType: JitterType.EQUAL,
  backoffMultiplier: 1,
  timeout: 15000,
};

/**
 * Circuit Breaker Configurations
 */

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000, // 1 minute
  monitoringPeriod: 120000, // 2 minutes
};

export const RPC_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 10,
  successThreshold: 3,
  timeout: 30000,
  monitoringPeriod: 60000,
};

export const DATABASE_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 30000,
  monitoringPeriod: 60000,
};

/**
 * Dead Letter Queue Configuration
 */

export const DEAD_LETTER_CONFIG = {
  maxRetentionDays: 7, // Keep failed messages for 7 days
  maxRetries: 3, // Max retry attempts from DLQ
  retryDelay: 3600000, // 1 hour between DLQ retries
  alertThreshold: 100, // Alert when DLQ has 100+ messages
};

/**
 * Retry strategy presets for common scenarios
 */

export const RETRY_PRESETS = {
  QUICK: {
    maxAttempts: 3,
    initialDelay: 100,
    maxDelay: 1000,
    strategy: RetryStrategy.EXPONENTIAL,
    jitterType: JitterType.FULL,
    backoffMultiplier: 2,
  },
  STANDARD: DEFAULT_RETRY_CONFIG,
  AGGRESSIVE: {
    maxAttempts: 10,
    initialDelay: 500,
    maxDelay: 60000,
    strategy: RetryStrategy.EXPONENTIAL,
    jitterType: JitterType.DECORRELATED,
    backoffMultiplier: 1.5,
  },
  PATIENT: {
    maxAttempts: 20,
    initialDelay: 5000,
    maxDelay: 300000,
    strategy: RetryStrategy.FIBONACCI,
    jitterType: JitterType.EQUAL,
    backoffMultiplier: 1,
  },
} as const;
