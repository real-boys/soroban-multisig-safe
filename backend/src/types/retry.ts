/**
 * Retry Strategy Types and Interfaces
 */

export enum RetryStrategy {
  EXPONENTIAL = 'EXPONENTIAL',
  LINEAR = 'LINEAR',
  FIXED = 'FIXED',
  FIBONACCI = 'FIBONACCI',
}

export enum JitterType {
  NONE = 'NONE',
  FULL = 'FULL',
  EQUAL = 'EQUAL',
  DECORRELATED = 'DECORRELATED',
}

export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  strategy: RetryStrategy;
  jitterType: JitterType;
  backoffMultiplier: number;
  retryableErrors?: string[]; // Error codes/messages that should trigger retry
  nonRetryableErrors?: string[]; // Error codes/messages that should NOT trigger retry
  timeout?: number; // Per-attempt timeout in milliseconds
  onRetry?: (attempt: number, error: Error, delay: number) => void;
  onFailure?: (error: Error, attempts: number) => void;
  onSuccess?: (result: any, attempts: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDuration: number;
  retryHistory: RetryAttempt[];
}

export interface RetryAttempt {
  attemptNumber: number;
  timestamp: number;
  duration: number;
  error?: string;
  success: boolean;
  delay?: number;
}

export interface DeadLetterMessage<T = any> {
  id: string;
  originalQueue: string;
  payload: T;
  error: string;
  attempts: number;
  firstAttempt: Date;
  lastAttempt: Date;
  retryHistory: RetryAttempt[];
  metadata?: Record<string, any>;
}

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening circuit
  successThreshold: number; // Number of successes to close circuit
  timeout: number; // Time in ms before attempting to close circuit
  monitoringPeriod: number; // Time window for counting failures
}

export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  nextAttemptTime?: number;
}
