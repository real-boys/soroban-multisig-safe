import { logger } from '@/utils/logger';
import { circuitBreakerService } from './CircuitBreakerService';
import { enhancedRPCService } from './EnhancedRPCService';
import { CircuitState } from '@/types/retry';

/**
 * Circuit Breaker Monitoring Service
 * 
 * Provides centralized monitoring, alerting, and health checks
 * for all circuit breakers in the system.
 */
export class CircuitBreakerMonitorService {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly checkIntervalMs: number;
  private alertCallbacks: Array<(alert: CircuitBreakerAlert) => void> = [];
  private alertHistory: CircuitBreakerAlert[] = [];
  private readonly maxAlertHistory = 1000;

  constructor(checkIntervalMs: number = 30000) {
    this.checkIntervalMs = checkIntervalMs;
  }

  /**
   * Start monitoring all circuit breakers
   */
  start(): void {
    if (this.monitoringInterval) {
      logger.warn('Circuit breaker monitor is already running');
      return;
    }

    logger.info('Starting circuit breaker monitoring service');
    
    this.monitoringInterval = setInterval(() => {
      this.checkAllCircuits();
    }, this.checkIntervalMs);

    // Initial check
    this.checkAllCircuits();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Circuit breaker monitoring service stopped');
    }
  }

  /**
   * Check all circuit breakers and generate alerts
   */
  private checkAllCircuits(): void {
    const stats = circuitBreakerService.getAllStats();
    
    for (const [name, stat] of stats) {
      // Alert on OPEN circuits
      if (stat.state === CircuitState.OPEN) {
        this.generateAlert({
          severity: 'critical',
          circuitName: name,
          state: stat.state,
          message: `Circuit breaker "${name}" is OPEN`,
          failures: stat.failures,
          timestamp: new Date(),
          nextAttemptTime: stat.nextAttemptTime ? new Date(stat.nextAttemptTime) : undefined,
        });
      }

      // Alert on HALF_OPEN circuits (informational)
      if (stat.state === CircuitState.HALF_OPEN) {
        this.generateAlert({
          severity: 'warning',
          circuitName: name,
          state: stat.state,
          message: `Circuit breaker "${name}" is HALF_OPEN (testing recovery)`,
          failures: stat.failures,
          timestamp: new Date(),
        });
      }

      // Alert on high failure rate in CLOSED state
      if (stat.state === CircuitState.CLOSED && stat.failures > 0) {
        const failureRate = stat.failures;
        if (failureRate >= 3) {
          this.generateAlert({
            severity: 'warning',
            circuitName: name,
            state: stat.state,
            message: `Circuit breaker "${name}" has ${failureRate} recent failures`,
            failures: stat.failures,
            timestamp: new Date(),
          });
        }
      }
    }
  }

  /**
   * Generate and dispatch an alert
   */
  private generateAlert(alert: CircuitBreakerAlert): void {
    // Check if we already alerted recently for this circuit
    const recentAlert = this.alertHistory.find(
      (a) =>
        a.circuitName === alert.circuitName &&
        a.state === alert.state &&
        Date.now() - a.timestamp.getTime() < 5 * 60 * 1000 // 5 minutes
    );

    if (recentAlert) {
      return; // Don't spam alerts
    }

    // Log the alert
    const logMessage = `[${alert.severity.toUpperCase()}] ${alert.message}`;
    if (alert.severity === 'critical') {
      logger.error(logMessage);
    } else if (alert.severity === 'warning') {
      logger.warn(logMessage);
    } else {
      logger.info(logMessage);
    }

    // Store in history
    this.alertHistory.push(alert);
    if (this.alertHistory.length > this.maxAlertHistory) {
      this.alertHistory.shift();
    }

    // Dispatch to callbacks
    this.alertCallbacks.forEach((callback) => {
      try {
        callback(alert);
      } catch (error) {
        logger.error('Error in alert callback:', error);
      }
    });
  }

  /**
   * Register an alert callback
   */
  onAlert(callback: (alert: CircuitBreakerAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Get comprehensive health report
   */
  getHealthReport(): CircuitBreakerHealthReport {
    const stats = circuitBreakerService.getAllStats();
    const circuits: CircuitHealthInfo[] = [];

    let totalCircuits = 0;
    let openCircuits = 0;
    let halfOpenCircuits = 0;
    let closedCircuits = 0;
    let totalFailures = 0;

    for (const [name, stat] of stats) {
      totalCircuits++;
      totalFailures += stat.failures;

      if (stat.state === CircuitState.OPEN) openCircuits++;
      else if (stat.state === CircuitState.HALF_OPEN) halfOpenCircuits++;
      else if (stat.state === CircuitState.CLOSED) closedCircuits++;

      circuits.push({
        name,
        state: stat.state,
        failures: stat.failures,
        successes: stat.successes,
        lastFailureTime: stat.lastFailureTime ? new Date(stat.lastFailureTime) : undefined,
        lastSuccessTime: stat.lastSuccessTime ? new Date(stat.lastSuccessTime) : undefined,
        nextAttemptTime: stat.nextAttemptTime ? new Date(stat.nextAttemptTime) : undefined,
        isHealthy: stat.state === CircuitState.CLOSED || stat.state === CircuitState.HALF_OPEN,
      });
    }

    // Get RPC provider stats
    const rpcProviders = enhancedRPCService.getProviderStats();

    return {
      timestamp: new Date(),
      summary: {
        totalCircuits,
        openCircuits,
        halfOpenCircuits,
        closedCircuits,
        totalFailures,
        overallHealth: openCircuits === 0 ? 'healthy' : openCircuits < totalCircuits / 2 ? 'degraded' : 'critical',
      },
      circuits,
      rpcProviders: rpcProviders.map((p) => ({
        url: p.url,
        name: p.name,
        isHealthy: p.isHealthy,
        failures: p.failures,
        circuitState: p.circuitState,
        lastCheck: p.lastCheck,
      })),
      recentAlerts: this.alertHistory.slice(-10),
    };
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit: number = 100): CircuitBreakerAlert[] {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Clear alert history
   */
  clearAlertHistory(): void {
    this.alertHistory = [];
    logger.info('Circuit breaker alert history cleared');
  }

  /**
   * Force check a specific circuit
   */
  checkCircuit(circuitName: string): CircuitHealthInfo | null {
    const stat = circuitBreakerService.getStats(circuitName);
    if (!stat) {
      return null;
    }

    return {
      name: circuitName,
      state: stat.state,
      failures: stat.failures,
      successes: stat.successes,
      lastFailureTime: stat.lastFailureTime ? new Date(stat.lastFailureTime) : undefined,
      lastSuccessTime: stat.lastSuccessTime ? new Date(stat.lastSuccessTime) : undefined,
      nextAttemptTime: stat.nextAttemptTime ? new Date(stat.nextAttemptTime) : undefined,
      isHealthy: stat.state === CircuitState.CLOSED || stat.state === CircuitState.HALF_OPEN,
    };
  }

  /**
   * Get metrics for monitoring systems (Prometheus, etc.)
   */
  getMetrics(): CircuitBreakerMetrics {
    const stats = circuitBreakerService.getAllStats();
    const metrics: CircuitBreakerMetrics = {
      circuit_breaker_state: {},
      circuit_breaker_failures: {},
      circuit_breaker_successes: {},
      circuit_breaker_open_count: 0,
      circuit_breaker_half_open_count: 0,
      circuit_breaker_closed_count: 0,
    };

    for (const [name, stat] of stats) {
      metrics.circuit_breaker_state[name] = stat.state;
      metrics.circuit_breaker_failures[name] = stat.failures;
      metrics.circuit_breaker_successes[name] = stat.successes;

      if (stat.state === CircuitState.OPEN) metrics.circuit_breaker_open_count++;
      else if (stat.state === CircuitState.HALF_OPEN) metrics.circuit_breaker_half_open_count++;
      else if (stat.state === CircuitState.CLOSED) metrics.circuit_breaker_closed_count++;
    }

    return metrics;
  }
}

export interface CircuitBreakerAlert {
  severity: 'info' | 'warning' | 'critical';
  circuitName: string;
  state: CircuitState;
  message: string;
  failures: number;
  timestamp: Date;
  nextAttemptTime?: Date;
}

export interface CircuitHealthInfo {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  nextAttemptTime?: Date;
  isHealthy: boolean;
}

export interface CircuitBreakerHealthReport {
  timestamp: Date;
  summary: {
    totalCircuits: number;
    openCircuits: number;
    halfOpenCircuits: number;
    closedCircuits: number;
    totalFailures: number;
    overallHealth: 'healthy' | 'degraded' | 'critical';
  };
  circuits: CircuitHealthInfo[];
  rpcProviders: Array<{
    url: string;
    name: string;
    isHealthy: boolean;
    failures: number;
    circuitState: string;
    lastCheck: Date | null;
  }>;
  recentAlerts: CircuitBreakerAlert[];
}

export interface CircuitBreakerMetrics {
  circuit_breaker_state: Record<string, CircuitState>;
  circuit_breaker_failures: Record<string, number>;
  circuit_breaker_successes: Record<string, number>;
  circuit_breaker_open_count: number;
  circuit_breaker_half_open_count: number;
  circuit_breaker_closed_count: number;
}

// Export singleton instance
export const circuitBreakerMonitorService = new CircuitBreakerMonitorService();
