import { logger } from '@/utils/logger';
import {
  CircuitBreakerConfig,
  CircuitState,
  CircuitBreakerStats,
} from '@/types/retry';
import { DEFAULT_CIRCUIT_BREAKER_CONFIG } from '@/config/retryConfig';

/**
 * Circuit Breaker Service
 * 
 * Prevents cascading failures by stopping requests to failing services
 * and allowing them time to recover.
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, reject requests immediately
 * - HALF_OPEN: Testing if service has recovered
 */
export class CircuitBreakerService {
  private circuits = new Map<string, CircuitBreakerState>();

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(
    circuitName: string,
    fn: () => Promise<T>,
    config: Partial<CircuitBreakerConfig> = {}
  ): Promise<T> {
    const fullConfig: CircuitBreakerConfig = {
      ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
      ...config,
    };

    const circuit = this.getOrCreateCircuit(circuitName, fullConfig);

    // Check circuit state
    const state = this.getCircuitState(circuit);

    if (state === CircuitState.OPEN) {
      // Check if timeout has passed
      if (Date.now() >= circuit.nextAttemptTime!) {
        // Move to HALF_OPEN state
        circuit.state = CircuitState.HALF_OPEN;
        logger.info(`Circuit "${circuitName}" moved to HALF_OPEN state`);
      } else {
        const error = new Error(`Circuit breaker "${circuitName}" is OPEN`);
        (error as any).circuitState = CircuitState.OPEN;
        throw error;
      }
    }

    try {
      const result = await fn();
      this.recordSuccess(circuit, circuitName);
      return result;
    } catch (error) {
      this.recordFailure(circuit, circuitName);
      throw error;
    }
  }

  /**
   * Get or create circuit breaker state
   */
  private getOrCreateCircuit(
    name: string,
    config: CircuitBreakerConfig
  ): CircuitBreakerState {
    if (!this.circuits.has(name)) {
      this.circuits.set(name, {
        name,
        config,
        state: CircuitState.CLOSED,
        failures: 0,
        successes: 0,
        lastFailureTime: undefined,
        lastSuccessTime: undefined,
        nextAttemptTime: undefined,
        failureTimestamps: [],
      });
      logger.info(`Created circuit breaker "${name}"`);
    }
    return this.circuits.get(name)!;
  }

  /**
   * Get current circuit state
   */
  private getCircuitState(circuit: CircuitBreakerState): CircuitState {
    // Clean up old failure timestamps
    const now = Date.now();
    circuit.failureTimestamps = circuit.failureTimestamps.filter(
      (timestamp) => now - timestamp < circuit.config.monitoringPeriod
    );
    circuit.failures = circuit.failureTimestamps.length;

    return circuit.state;
  }

  /**
   * Record successful execution
   */
  private recordSuccess(circuit: CircuitBreakerState, name: string): void {
    circuit.lastSuccessTime = Date.now();
    circuit.successes++;

    if (circuit.state === CircuitState.HALF_OPEN) {
      // Check if we have enough successes to close the circuit
      if (circuit.successes >= circuit.config.successThreshold) {
        circuit.state = CircuitState.CLOSED;
        circuit.failures = 0;
        circuit.successes = 0;
        circuit.failureTimestamps = [];
        logger.info(`Circuit "${name}" moved to CLOSED state after ${circuit.successes} successes`);
      }
    } else if (circuit.state === CircuitState.CLOSED) {
      // Reset success counter in closed state
      circuit.successes = 0;
    }
  }

  /**
   * Record failed execution
   */
  private recordFailure(circuit: CircuitBreakerState, name: string): void {
    const now = Date.now();
    circuit.lastFailureTime = now;
    circuit.failureTimestamps.push(now);
    circuit.failures++;

    if (circuit.state === CircuitState.HALF_OPEN) {
      // Any failure in HALF_OPEN state opens the circuit again
      this.openCircuit(circuit, name);
    } else if (circuit.state === CircuitState.CLOSED) {
      // Check if we've exceeded failure threshold
      if (circuit.failures >= circuit.config.failureThreshold) {
        this.openCircuit(circuit, name);
      }
    }
  }

  /**
   * Open the circuit
   */
  private openCircuit(circuit: CircuitBreakerState, name: string): void {
    circuit.state = CircuitState.OPEN;
    circuit.nextAttemptTime = Date.now() + circuit.config.timeout;
    circuit.successes = 0;
    
    logger.warn(
      `Circuit "${name}" OPENED after ${circuit.failures} failures. ` +
      `Will retry at ${new Date(circuit.nextAttemptTime).toISOString()}`
    );
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(circuitName: string): CircuitBreakerStats | null {
    const circuit = this.circuits.get(circuitName);
    if (!circuit) {
      return null;
    }

    return {
      state: circuit.state,
      failures: circuit.failures,
      successes: circuit.successes,
      lastFailureTime: circuit.lastFailureTime,
      lastSuccessTime: circuit.lastSuccessTime,
      nextAttemptTime: circuit.nextAttemptTime,
    };
  }

  /**
   * Get all circuit breaker statistics
   */
  getAllStats(): Map<string, CircuitBreakerStats> {
    const stats = new Map<string, CircuitBreakerStats>();
    
    for (const [name, circuit] of this.circuits) {
      stats.set(name, {
        state: circuit.state,
        failures: circuit.failures,
        successes: circuit.successes,
        lastFailureTime: circuit.lastFailureTime,
        lastSuccessTime: circuit.lastSuccessTime,
        nextAttemptTime: circuit.nextAttemptTime,
      });
    }

    return stats;
  }

  /**
   * Manually reset a circuit breaker
   */
  reset(circuitName: string): void {
    const circuit = this.circuits.get(circuitName);
    if (!circuit) {
      logger.warn(`Circuit "${circuitName}" not found`);
      return;
    }

    circuit.state = CircuitState.CLOSED;
    circuit.failures = 0;
    circuit.successes = 0;
    circuit.failureTimestamps = [];
    circuit.lastFailureTime = undefined;
    circuit.nextAttemptTime = undefined;

    logger.info(`Circuit "${circuitName}" manually reset to CLOSED state`);
  }

  /**
   * Manually open a circuit breaker
   */
  open(circuitName: string): void {
    const circuit = this.circuits.get(circuitName);
    if (!circuit) {
      logger.warn(`Circuit "${circuitName}" not found`);
      return;
    }

    this.openCircuit(circuit, circuitName);
  }

  /**
   * Check if circuit is open
   */
  isOpen(circuitName: string): boolean {
    const circuit = this.circuits.get(circuitName);
    if (!circuit) {
      return false;
    }

    return this.getCircuitState(circuit) === CircuitState.OPEN;
  }

  /**
   * Remove a circuit breaker
   */
  remove(circuitName: string): void {
    this.circuits.delete(circuitName);
    logger.info(`Circuit "${circuitName}" removed`);
  }
}

interface CircuitBreakerState {
  name: string;
  config: CircuitBreakerConfig;
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  nextAttemptTime?: number;
  failureTimestamps: number[];
}

export const circuitBreakerService = new CircuitBreakerService();
