import { logger } from '@/utils/logger';
import {
  RetryConfig,
  RetryResult,
  RetryAttempt,
  RetryStrategy,
  JitterType,
} from '@/types/retry';
import { DEFAULT_RETRY_CONFIG } from '@/config/retryConfig';

/**
 * Sophisticated Retry Service with Exponential Backoff and Jitter
 * 
 * Features:
 * - Multiple retry strategies (exponential, linear, fixed, fibonacci)
 * - Jitter types (full, equal, decorrelated, none)
 * - Configurable retryable/non-retryable errors
 * - Per-attempt timeout
 * - Detailed retry history
 * - Callbacks for monitoring
 */
export class RetryService {
  /**
   * Execute a function with retry logic
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<RetryResult<T>> {
    const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    const retryHistory: RetryAttempt[] = [];
    const startTime = Date.now();
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= fullConfig.maxAttempts; attempt++) {
      const attemptStart = Date.now();

      try {
        // Execute with timeout if configured
        const result = fullConfig.timeout
          ? await this.executeWithTimeout(fn, fullConfig.timeout)
          : await fn();

        const attemptDuration = Date.now() - attemptStart;

        // Record successful attempt
        retryHistory.push({
          attemptNumber: attempt,
          timestamp: attemptStart,
          duration: attemptDuration,
          success: true,
        });

        // Call success callback
        if (fullConfig.onSuccess) {
          fullConfig.onSuccess(result, attempt);
        }

        logger.info(`Operation succeeded on attempt ${attempt}/${fullConfig.maxAttempts}`);

        return {
          success: true,
          result,
          attempts: attempt,
          totalDuration: Date.now() - startTime,
          retryHistory,
        };
      } catch (error: any) {
        lastError = error;
        const attemptDuration = Date.now() - attemptStart;

        // Record failed attempt
        retryHistory.push({
          attemptNumber: attempt,
          timestamp: attemptStart,
          duration: attemptDuration,
          error: error.message || String(error),
          success: false,
        });

        // Check if error is retryable
        if (!this.isRetryableError(error, fullConfig)) {
          logger.warn(`Non-retryable error encountered: ${error.message}`);
          
          if (fullConfig.onFailure) {
            fullConfig.onFailure(error, attempt);
          }

          return {
            success: false,
            error,
            attempts: attempt,
            totalDuration: Date.now() - startTime,
            retryHistory,
          };
        }

        // Don't retry if this was the last attempt
        if (attempt >= fullConfig.maxAttempts) {
          logger.error(`All ${fullConfig.maxAttempts} retry attempts exhausted`);
          
          if (fullConfig.onFailure) {
            fullConfig.onFailure(error, attempt);
          }

          return {
            success: false,
            error,
            attempts: attempt,
            totalDuration: Date.now() - startTime,
            retryHistory,
          };
        }

        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt, fullConfig);
        
        // Record delay in history
        retryHistory[retryHistory.length - 1].delay = delay;

        logger.warn(
          `Attempt ${attempt}/${fullConfig.maxAttempts} failed: ${error.message}. ` +
          `Retrying in ${delay}ms...`
        );

        // Call retry callback
        if (fullConfig.onRetry) {
          fullConfig.onRetry(attempt, error, delay);
        }

        // Wait before next attempt
        await this.sleep(delay);
      }
    }

    // This should never be reached, but TypeScript needs it
    return {
      success: false,
      error: lastError,
      attempts: fullConfig.maxAttempts,
      totalDuration: Date.now() - startTime,
      retryHistory,
    };
  }

  /**
   * Calculate delay based on retry strategy and jitter
   */
  private calculateDelay(attempt: number, config: RetryConfig): number {
    let baseDelay: number;

    // Calculate base delay based on strategy
    switch (config.strategy) {
      case RetryStrategy.EXPONENTIAL:
        baseDelay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1);
        break;

      case RetryStrategy.LINEAR:
        baseDelay = config.initialDelay * attempt;
        break;

      case RetryStrategy.FIXED:
        baseDelay = config.initialDelay;
        break;

      case RetryStrategy.FIBONACCI:
        baseDelay = this.fibonacci(attempt) * config.initialDelay;
        break;

      default:
        baseDelay = config.initialDelay;
    }

    // Cap at max delay
    baseDelay = Math.min(baseDelay, config.maxDelay);

    // Apply jitter
    const delayWithJitter = this.applyJitter(baseDelay, config.jitterType, attempt);

    return Math.round(delayWithJitter);
  }

  /**
   * Apply jitter to delay
   */
  private applyJitter(delay: number, jitterType: JitterType, attempt: number): number {
    switch (jitterType) {
      case JitterType.NONE:
        return delay;

      case JitterType.FULL:
        // Random value between 0 and delay
        return Math.random() * delay;

      case JitterType.EQUAL:
        // delay/2 + random value between 0 and delay/2
        return delay / 2 + Math.random() * (delay / 2);

      case JitterType.DECORRELATED:
        // Decorrelated jitter: random value between initialDelay and delay * 3
        const min = delay / 3;
        const max = delay * 3;
        return min + Math.random() * (max - min);

      default:
        return delay;
    }
  }

  /**
   * Calculate Fibonacci number for Fibonacci backoff
   */
  private fibonacci(n: number): number {
    if (n <= 1) return 1;
    if (n === 2) return 2;

    let prev = 1;
    let curr = 2;

    for (let i = 3; i <= n; i++) {
      const next = prev + curr;
      prev = curr;
      curr = next;
    }

    return curr;
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: any, config: RetryConfig): boolean {
    const errorMessage = error.message || String(error);
    const errorCode = error.code || error.status || error.statusCode;

    // Check non-retryable errors first
    if (config.nonRetryableErrors) {
      for (const nonRetryable of config.nonRetryableErrors) {
        if (
          errorMessage.includes(nonRetryable) ||
          String(errorCode) === nonRetryable
        ) {
          return false;
        }
      }
    }

    // If retryable errors are specified, check if error matches
    if (config.retryableErrors && config.retryableErrors.length > 0) {
      for (const retryable of config.retryableErrors) {
        if (
          errorMessage.includes(retryable) ||
          String(errorCode) === retryable
        ) {
          return true;
        }
      }
      // If retryable errors are specified but error doesn't match, don't retry
      return false;
    }

    // Default: retry all errors if no specific errors are configured
    return true;
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), timeout)
      ),
    ]);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Retry with exponential backoff (convenience method)
   */
  async retryWithExponentialBackoff<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    initialDelay: number = 1000
  ): Promise<T> {
    const result = await this.executeWithRetry(fn, {
      maxAttempts,
      initialDelay,
      strategy: RetryStrategy.EXPONENTIAL,
      jitterType: JitterType.FULL,
    });

    if (!result.success) {
      throw result.error || new Error('Operation failed after retries');
    }

    return result.result!;
  }

  /**
   * Retry with linear backoff (convenience method)
   */
  async retryWithLinearBackoff<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    initialDelay: number = 1000
  ): Promise<T> {
    const result = await this.executeWithRetry(fn, {
      maxAttempts,
      initialDelay,
      strategy: RetryStrategy.LINEAR,
      jitterType: JitterType.EQUAL,
    });

    if (!result.success) {
      throw result.error || new Error('Operation failed after retries');
    }

    return result.result!;
  }

  /**
   * Retry with fixed delay (convenience method)
   */
  async retryWithFixedDelay<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    delay: number = 1000
  ): Promise<T> {
    const result = await this.executeWithRetry(fn, {
      maxAttempts,
      initialDelay: delay,
      strategy: RetryStrategy.FIXED,
      jitterType: JitterType.NONE,
    });

    if (!result.success) {
      throw result.error || new Error('Operation failed after retries');
    }

    return result.result!;
  }

  /**
   * Batch retry - execute multiple operations with retry
   */
  async batchRetry<T>(
    operations: Array<() => Promise<T>>,
    config: Partial<RetryConfig> = {}
  ): Promise<Array<RetryResult<T>>> {
    return Promise.all(
      operations.map((op) => this.executeWithRetry(op, config))
    );
  }

  /**
   * Retry until condition is met
   */
  async retryUntil<T>(
    fn: () => Promise<T>,
    condition: (result: T) => boolean,
    config: Partial<RetryConfig> = {}
  ): Promise<RetryResult<T>> {
    const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    
    return this.executeWithRetry(async () => {
      const result = await fn();
      if (!condition(result)) {
        throw new Error('Condition not met');
      }
      return result;
    }, fullConfig);
  }
}

export const retryService = new RetryService();
