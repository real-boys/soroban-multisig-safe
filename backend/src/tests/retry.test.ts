import { RetryService } from '@/services/RetryService';
import { CircuitBreakerService } from '@/services/CircuitBreakerService';
import { RetryStrategy, JitterType, CircuitState } from '@/types/retry';

describe('RetryService', () => {
  let retryService: RetryService;

  beforeEach(() => {
    retryService = new RetryService();
  });

  describe('executeWithRetry', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await retryService.executeWithRetry(fn, {
        maxAttempts: 3,
        initialDelay: 100,
        strategy: RetryStrategy.EXPONENTIAL,
        jitterType: JitterType.NONE,
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const result = await retryService.executeWithRetry(fn, {
        maxAttempts: 5,
        initialDelay: 10,
        strategy: RetryStrategy.EXPONENTIAL,
        jitterType: JitterType.NONE,
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(3);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should fail after max attempts', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Always fails'));

      const result = await retryService.executeWithRetry(fn, {
        maxAttempts: 3,
        initialDelay: 10,
        strategy: RetryStrategy.EXPONENTIAL,
        jitterType: JitterType.NONE,
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Always fails');
      expect(result.attempts).toBe(3);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('400: Bad Request'));

      const result = await retryService.executeWithRetry(fn, {
        maxAttempts: 5,
        initialDelay: 10,
        nonRetryableErrors: ['400'],
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should only retry specified retryable errors', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('NETWORK_ERROR'));

      const result = await retryService.executeWithRetry(fn, {
        maxAttempts: 3,
        initialDelay: 10,
        retryableErrors: ['NETWORK_ERROR', 'TIMEOUT'],
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should call onRetry callback', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');

      const onRetry = jest.fn();

      await retryService.executeWithRetry(fn, {
        maxAttempts: 3,
        initialDelay: 10,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        1,
        expect.any(Error),
        expect.any(Number)
      );
    });

    it('should call onSuccess callback', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const onSuccess = jest.fn();

      await retryService.executeWithRetry(fn, {
        maxAttempts: 3,
        onSuccess,
      });

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith('success', 1);
    });

    it('should call onFailure callback', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Fail'));
      const onFailure = jest.fn();

      await retryService.executeWithRetry(fn, {
        maxAttempts: 2,
        initialDelay: 10,
        onFailure,
      });

      expect(onFailure).toHaveBeenCalledTimes(1);
      expect(onFailure).toHaveBeenCalledWith(expect.any(Error), 2);
    });

    it('should timeout if operation takes too long', async () => {
      const fn = jest.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );

      const result = await retryService.executeWithRetry(fn, {
        maxAttempts: 2,
        initialDelay: 10,
        timeout: 50,
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('TIMEOUT');
    });
  });

  describe('Retry Strategies', () => {
    it('should use exponential backoff', async () => {
      const delays: number[] = [];
      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      await retryService.executeWithRetry(fn, {
        maxAttempts: 4,
        initialDelay: 100,
        strategy: RetryStrategy.EXPONENTIAL,
        jitterType: JitterType.NONE,
        backoffMultiplier: 2,
        onRetry: (_, __, delay) => delays.push(delay),
      });

      // Exponential: 100, 200, 400
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);
      expect(delays[2]).toBe(400);
    });

    it('should use linear backoff', async () => {
      const delays: number[] = [];
      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      await retryService.executeWithRetry(fn, {
        maxAttempts: 4,
        initialDelay: 100,
        strategy: RetryStrategy.LINEAR,
        jitterType: JitterType.NONE,
        onRetry: (_, __, delay) => delays.push(delay),
      });

      // Linear: 100, 200, 300
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);
      expect(delays[2]).toBe(300);
    });

    it('should use fixed delay', async () => {
      const delays: number[] = [];
      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      await retryService.executeWithRetry(fn, {
        maxAttempts: 4,
        initialDelay: 100,
        strategy: RetryStrategy.FIXED,
        jitterType: JitterType.NONE,
        onRetry: (_, __, delay) => delays.push(delay),
      });

      // Fixed: 100, 100, 100
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(100);
      expect(delays[2]).toBe(100);
    });

    it('should respect maxDelay', async () => {
      const delays: number[] = [];
      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      await retryService.executeWithRetry(fn, {
        maxAttempts: 5,
        initialDelay: 100,
        maxDelay: 250,
        strategy: RetryStrategy.EXPONENTIAL,
        jitterType: JitterType.NONE,
        backoffMultiplier: 2,
        onRetry: (_, __, delay) => delays.push(delay),
      });

      // Should cap at 250: 100, 200, 250, 250
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);
      expect(delays[2]).toBe(250);
      expect(delays[3]).toBe(250);
    });
  });

  describe('Convenience Methods', () => {
    it('should retry with exponential backoff', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');

      const result = await retryService.retryWithExponentialBackoff(fn, 3, 10);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry with linear backoff', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');

      const result = await retryService.retryWithLinearBackoff(fn, 3, 10);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry with fixed delay', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');

      const result = await retryService.retryWithFixedDelay(fn, 3, 10);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Batch Retry', () => {
    it('should retry multiple operations', async () => {
      const fn1 = jest.fn().mockResolvedValue('result1');
      const fn2 = jest.fn().mockResolvedValue('result2');
      const fn3 = jest.fn().mockRejectedValue(new Error('Fail'));

      const results = await retryService.batchRetry([fn1, fn2, fn3], {
        maxAttempts: 2,
        initialDelay: 10,
      });

      expect(results[0].success).toBe(true);
      expect(results[0].result).toBe('result1');
      expect(results[1].success).toBe(true);
      expect(results[1].result).toBe('result2');
      expect(results[2].success).toBe(false);
    });
  });

  describe('Retry Until', () => {
    it('should retry until condition is met', async () => {
      let counter = 0;
      const fn = jest.fn().mockImplementation(() => {
        counter++;
        return Promise.resolve(counter);
      });

      const result = await retryService.retryUntil(
        fn,
        (value) => value >= 3,
        {
          maxAttempts: 5,
          initialDelay: 10,
        }
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe(3);
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });
});

describe('CircuitBreakerService', () => {
  let circuitBreakerService: CircuitBreakerService;

  beforeEach(() => {
    circuitBreakerService = new CircuitBreakerService();
  });

  it('should start in CLOSED state', async () => {
    const fn = jest.fn().mockResolvedValue('success');

    await circuitBreakerService.execute('test-circuit', fn);

    const stats = circuitBreakerService.getStats('test-circuit');
    expect(stats?.state).toBe(CircuitState.CLOSED);
  });

  it('should open circuit after threshold failures', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('Fail'));

    const config = {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
      monitoringPeriod: 60000,
    };

    // Fail 3 times to open circuit
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreakerService.execute('test-circuit', fn, config);
      } catch (error) {
        // Expected
      }
    }

    const stats = circuitBreakerService.getStats('test-circuit');
    expect(stats?.state).toBe(CircuitState.OPEN);
  });

  it('should reject requests when circuit is open', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('Fail'));

    const config = {
      failureThreshold: 2,
      successThreshold: 2,
      timeout: 100,
      monitoringPeriod: 60000,
    };

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      try {
        await circuitBreakerService.execute('test-circuit', fn, config);
      } catch (error) {
        // Expected
      }
    }

    // Next request should be rejected immediately
    await expect(
      circuitBreakerService.execute('test-circuit', fn, config)
    ).rejects.toThrow('Circuit breaker "test-circuit" is OPEN');
  });

  it('should move to HALF_OPEN after timeout', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('Fail'));

    const config = {
      failureThreshold: 2,
      successThreshold: 2,
      timeout: 50, // Short timeout for testing
      monitoringPeriod: 60000,
    };

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      try {
        await circuitBreakerService.execute('test-circuit', fn, config);
      } catch (error) {
        // Expected
      }
    }

    // Wait for timeout
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Next attempt should move to HALF_OPEN
    fn.mockResolvedValue('success');
    await circuitBreakerService.execute('test-circuit', fn, config);

    const stats = circuitBreakerService.getStats('test-circuit');
    expect(stats?.state).toBe(CircuitState.HALF_OPEN);
  });

  it('should close circuit after success threshold in HALF_OPEN', async () => {
    const fn = jest.fn();

    const config = {
      failureThreshold: 2,
      successThreshold: 2,
      timeout: 50,
      monitoringPeriod: 60000,
    };

    // Open the circuit
    fn.mockRejectedValue(new Error('Fail'));
    for (let i = 0; i < 2; i++) {
      try {
        await circuitBreakerService.execute('test-circuit', fn, config);
      } catch (error) {
        // Expected
      }
    }

    // Wait for timeout
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Succeed enough times to close circuit
    fn.mockResolvedValue('success');
    for (let i = 0; i < 2; i++) {
      await circuitBreakerService.execute('test-circuit', fn, config);
    }

    const stats = circuitBreakerService.getStats('test-circuit');
    expect(stats?.state).toBe(CircuitState.CLOSED);
  });

  it('should manually reset circuit', () => {
    circuitBreakerService.open('test-circuit');
    circuitBreakerService.reset('test-circuit');

    const stats = circuitBreakerService.getStats('test-circuit');
    expect(stats?.state).toBe(CircuitState.CLOSED);
  });
});
