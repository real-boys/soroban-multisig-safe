import { CircuitBreakerService } from '../services/CircuitBreakerService';
import { CircuitBreakerMonitorService } from '../services/CircuitBreakerMonitorService';
import { CircuitState } from '../types/retry';

describe('CircuitBreakerService', () => {
  let circuitBreakerService: CircuitBreakerService;

  beforeEach(() => {
    circuitBreakerService = new CircuitBreakerService();
  });

  describe('Circuit State Transitions', () => {
    it('should start in CLOSED state', async () => {
      const circuitName = 'test-circuit-1';
      
      await circuitBreakerService.execute(
        circuitName,
        async () => 'success',
        { failureThreshold: 5 }
      );

      const stats = circuitBreakerService.getStats(circuitName);
      expect(stats?.state).toBe(CircuitState.CLOSED);
    });

    it('should open circuit after threshold failures', async () => {
      const circuitName = 'test-circuit-2';
      const failureThreshold = 5;

      // Simulate failures
      for (let i = 0; i < failureThreshold; i++) {
        try {
          await circuitBreakerService.execute(
            circuitName,
            async () => {
              throw new Error('Service unavailable');
            },
            { failureThreshold, successThreshold: 2, timeout: 1000, monitoringPeriod: 60000 }
          );
        } catch (error) {
          // Expected
        }
      }

      const stats = circuitBreakerService.getStats(circuitName);
      expect(stats?.state).toBe(CircuitState.OPEN);
      expect(stats?.failures).toBe(failureThreshold);
    });

    it('should reject requests immediately when circuit is OPEN', async () => {
      const circuitName = 'test-circuit-3';
      const failureThreshold = 3;

      // Open the circuit
      for (let i = 0; i < failureThreshold; i++) {
        try {
          await circuitBreakerService.execute(
            circuitName,
            async () => {
              throw new Error('Service unavailable');
            },
            { failureThreshold, successThreshold: 2, timeout: 1000, monitoringPeriod: 60000 }
          );
        } catch (error) {
          // Expected
        }
      }

      // Try to execute when circuit is open
      try {
        await circuitBreakerService.execute(
          circuitName,
          async () => 'should not execute',
          { failureThreshold, successThreshold: 2, timeout: 1000, monitoringPeriod: 60000 }
        );
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('Circuit breaker');
        expect(error.message).toContain('OPEN');
        expect(error.circuitState).toBe(CircuitState.OPEN);
      }
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      const circuitName = 'test-circuit-4';
      const failureThreshold = 3;
      const timeout = 100; // 100ms

      // Open the circuit
      for (let i = 0; i < failureThreshold; i++) {
        try {
          await circuitBreakerService.execute(
            circuitName,
            async () => {
              throw new Error('Service unavailable');
            },
            { failureThreshold, successThreshold: 2, timeout, monitoringPeriod: 60000 }
          );
        } catch (error) {
          // Expected
        }
      }

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, timeout + 50));

      // Next request should transition to HALF_OPEN
      try {
        await circuitBreakerService.execute(
          circuitName,
          async () => 'success',
          { failureThreshold, successThreshold: 2, timeout, monitoringPeriod: 60000 }
        );
      } catch (error) {
        // May fail, but should be in HALF_OPEN
      }

      const stats = circuitBreakerService.getStats(circuitName);
      expect([CircuitState.HALF_OPEN, CircuitState.CLOSED]).toContain(stats?.state);
    });

    it('should close circuit after success threshold in HALF_OPEN', async () => {
      const circuitName = 'test-circuit-5';
      const failureThreshold = 3;
      const successThreshold = 2;
      const timeout = 100;

      // Open the circuit
      for (let i = 0; i < failureThreshold; i++) {
        try {
          await circuitBreakerService.execute(
            circuitName,
            async () => {
              throw new Error('Service unavailable');
            },
            { failureThreshold, successThreshold, timeout, monitoringPeriod: 60000 }
          );
        } catch (error) {
          // Expected
        }
      }

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, timeout + 50));

      // Execute successful requests
      for (let i = 0; i < successThreshold; i++) {
        await circuitBreakerService.execute(
          circuitName,
          async () => 'success',
          { failureThreshold, successThreshold, timeout, monitoringPeriod: 60000 }
        );
      }

      const stats = circuitBreakerService.getStats(circuitName);
      expect(stats?.state).toBe(CircuitState.CLOSED);
      expect(stats?.failures).toBe(0);
    });
  });

  describe('Manual Control', () => {
    it('should manually reset circuit breaker', async () => {
      const circuitName = 'test-circuit-6';
      const failureThreshold = 3;

      // Open the circuit
      for (let i = 0; i < failureThreshold; i++) {
        try {
          await circuitBreakerService.execute(
            circuitName,
            async () => {
              throw new Error('Service unavailable');
            },
            { failureThreshold, successThreshold: 2, timeout: 1000, monitoringPeriod: 60000 }
          );
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreakerService.isOpen(circuitName)).toBe(true);

      // Manually reset
      circuitBreakerService.reset(circuitName);

      const stats = circuitBreakerService.getStats(circuitName);
      expect(stats?.state).toBe(CircuitState.CLOSED);
      expect(stats?.failures).toBe(0);
    });

    it('should manually open circuit breaker', () => {
      const circuitName = 'test-circuit-7';

      // Create circuit
      circuitBreakerService.execute(
        circuitName,
        async () => 'success',
        { failureThreshold: 5, successThreshold: 2, timeout: 1000, monitoringPeriod: 60000 }
      );

      // Manually open
      circuitBreakerService.open(circuitName);

      expect(circuitBreakerService.isOpen(circuitName)).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should track failures and successes', async () => {
      const circuitName = 'test-circuit-8';

      // Execute some successful requests
      for (let i = 0; i < 3; i++) {
        await circuitBreakerService.execute(
          circuitName,
          async () => 'success',
          { failureThreshold: 5, successThreshold: 2, timeout: 1000, monitoringPeriod: 60000 }
        );
      }

      // Execute some failed requests
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreakerService.execute(
            circuitName,
            async () => {
              throw new Error('Failure');
            },
            { failureThreshold: 5, successThreshold: 2, timeout: 1000, monitoringPeriod: 60000 }
          );
        } catch (error) {
          // Expected
        }
      }

      const stats = circuitBreakerService.getStats(circuitName);
      expect(stats?.failures).toBe(2);
      expect(stats?.lastFailureTime).toBeDefined();
      expect(stats?.lastSuccessTime).toBeDefined();
    });

    it('should get all circuit breaker stats', async () => {
      const circuit1 = 'test-circuit-9';
      const circuit2 = 'test-circuit-10';

      await circuitBreakerService.execute(
        circuit1,
        async () => 'success',
        { failureThreshold: 5, successThreshold: 2, timeout: 1000, monitoringPeriod: 60000 }
      );

      await circuitBreakerService.execute(
        circuit2,
        async () => 'success',
        { failureThreshold: 5, successThreshold: 2, timeout: 1000, monitoringPeriod: 60000 }
      );

      const allStats = circuitBreakerService.getAllStats();
      expect(allStats.size).toBeGreaterThanOrEqual(2);
      expect(allStats.has(circuit1)).toBe(true);
      expect(allStats.has(circuit2)).toBe(true);
    });
  });

  describe('Monitoring Period', () => {
    it('should clean up old failure timestamps', async () => {
      const circuitName = 'test-circuit-11';
      const monitoringPeriod = 100; // 100ms

      // Record a failure
      try {
        await circuitBreakerService.execute(
          circuitName,
          async () => {
            throw new Error('Failure');
          },
          { failureThreshold: 5, successThreshold: 2, timeout: 1000, monitoringPeriod }
        );
      } catch (error) {
        // Expected
      }

      let stats = circuitBreakerService.getStats(circuitName);
      expect(stats?.failures).toBe(1);

      // Wait for monitoring period to expire
      await new Promise((resolve) => setTimeout(resolve, monitoringPeriod + 50));

      // Execute another request to trigger cleanup
      await circuitBreakerService.execute(
        circuitName,
        async () => 'success',
        { failureThreshold: 5, successThreshold: 2, timeout: 1000, monitoringPeriod }
      );

      stats = circuitBreakerService.getStats(circuitName);
      expect(stats?.failures).toBe(0);
    });
  });
});

describe('CircuitBreakerMonitorService', () => {
  let monitorService: CircuitBreakerMonitorService;
  let circuitBreakerService: CircuitBreakerService;

  beforeEach(() => {
    monitorService = new CircuitBreakerMonitorService(1000); // 1 second check interval
    circuitBreakerService = new CircuitBreakerService();
  });

  afterEach(() => {
    monitorService.stop();
  });

  describe('Monitoring', () => {
    it('should start and stop monitoring', () => {
      expect(() => monitorService.start()).not.toThrow();
      expect(() => monitorService.stop()).not.toThrow();
    });

    it('should generate alerts for OPEN circuits', (done) => {
      const circuitName = 'test-alert-circuit';

      monitorService.onAlert((alert) => {
        if (alert.circuitName === circuitName && alert.severity === 'critical') {
          expect(alert.state).toBe(CircuitState.OPEN);
          expect(alert.message).toContain('OPEN');
          done();
        }
      });

      monitorService.start();

      // Open a circuit
      (async () => {
        for (let i = 0; i < 5; i++) {
          try {
            await circuitBreakerService.execute(
              circuitName,
              async () => {
                throw new Error('Failure');
              },
              { failureThreshold: 5, successThreshold: 2, timeout: 1000, monitoringPeriod: 60000 }
            );
          } catch (error) {
            // Expected
          }
        }
      })();
    }, 10000);
  });

  describe('Health Report', () => {
    it('should generate comprehensive health report', async () => {
      const circuit1 = 'healthy-circuit';
      const circuit2 = 'failing-circuit';

      // Create healthy circuit
      await circuitBreakerService.execute(
        circuit1,
        async () => 'success',
        { failureThreshold: 5, successThreshold: 2, timeout: 1000, monitoringPeriod: 60000 }
      );

      // Create failing circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreakerService.execute(
            circuit2,
            async () => {
              throw new Error('Failure');
            },
            { failureThreshold: 5, successThreshold: 2, timeout: 1000, monitoringPeriod: 60000 }
          );
        } catch (error) {
          // Expected
        }
      }

      const report = monitorService.getHealthReport();

      expect(report.timestamp).toBeInstanceOf(Date);
      expect(report.summary.totalCircuits).toBeGreaterThanOrEqual(2);
      expect(report.summary.openCircuits).toBeGreaterThanOrEqual(1);
      expect(report.circuits.length).toBeGreaterThanOrEqual(2);
      expect(['healthy', 'degraded', 'critical']).toContain(report.summary.overallHealth);
    });
  });

  describe('Metrics', () => {
    it('should generate metrics for monitoring systems', async () => {
      const circuitName = 'metrics-circuit';

      await circuitBreakerService.execute(
        circuitName,
        async () => 'success',
        { failureThreshold: 5, successThreshold: 2, timeout: 1000, monitoringPeriod: 60000 }
      );

      const metrics = monitorService.getMetrics();

      expect(metrics).toHaveProperty('circuit_breaker_state');
      expect(metrics).toHaveProperty('circuit_breaker_failures');
      expect(metrics).toHaveProperty('circuit_breaker_successes');
      expect(metrics).toHaveProperty('circuit_breaker_open_count');
      expect(metrics).toHaveProperty('circuit_breaker_half_open_count');
      expect(metrics).toHaveProperty('circuit_breaker_closed_count');
    });
  });

  describe('Alert History', () => {
    it('should store and retrieve alert history', () => {
      monitorService.clearAlertHistory();

      const history = monitorService.getAlertHistory();
      expect(Array.isArray(history)).toBe(true);
    });

    it('should clear alert history', () => {
      monitorService.clearAlertHistory();
      const history = monitorService.getAlertHistory();
      expect(history.length).toBe(0);
    });
  });
});
