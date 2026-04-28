import axios, { AxiosError } from 'axios';
import { logger } from '@/utils/logger';
import { retryService } from './RetryService';
import { circuitBreakerService } from './CircuitBreakerService';
import { RPC_RETRY_CONFIG, RPC_CIRCUIT_BREAKER_CONFIG } from '@/config/retryConfig';

/**
 * Enhanced RPC Service with Retry Logic and Circuit Breaker
 * 
 * Features:
 * - Exponential backoff with jitter
 * - Circuit breaker protection
 * - Automatic failover between providers
 * - Detailed error handling
 * - Performance monitoring
 */
export class EnhancedRPCService {
  private providers: RPCProvider[] = [];
  private currentProviderIndex: number = 0;

  constructor(providerUrls: string[] = []) {
    this.initializeProviders(providerUrls);
  }

  /**
   * Initialize RPC providers
   */
  private initializeProviders(urls: string[]): void {
    this.providers = urls.map((url, index) => ({
      url,
      name: `rpc-provider-${index}`,
      isHealthy: true,
      failures: 0,
      lastCheck: null,
    }));

    logger.info(`Initialized ${this.providers.length} RPC providers with retry logic`);
  }

  /**
   * Make RPC call with retry and circuit breaker
   */
  async makeRPCCall<T>(
    method: string,
    params: any = {},
    options: RPCCallOptions = {}
  ): Promise<T> {
    const maxProviderAttempts = this.providers.length;
    let lastError: Error | null = null;

    for (let providerAttempt = 0; providerAttempt < maxProviderAttempts; providerAttempt++) {
      const provider = this.getNextProvider();
      
      if (!provider) {
        throw new Error('No RPC providers available');
      }

      try {
        // Execute with circuit breaker and retry logic
        const result = await circuitBreakerService.execute(
          provider.name,
          async () => {
            return await retryService.executeWithRetry(
              async () => {
                return await this.executeSingleRPCCall<T>(
                  provider.url,
                  method,
                  params,
                  options
                );
              },
              {
                ...RPC_RETRY_CONFIG,
                ...options.retryConfig,
                onRetry: (attempt, error, delay) => {
                  logger.warn(
                    `RPC call to ${provider.url} failed (attempt ${attempt}): ${error.message}. ` +
                    `Retrying in ${delay}ms...`
                  );
                },
              }
            );
          },
          RPC_CIRCUIT_BREAKER_CONFIG
        );

        if (result.success) {
          this.markProviderHealthy(provider);
          return result.result!;
        } else {
          lastError = result.error || new Error('RPC call failed');
          this.markProviderUnhealthy(provider);
          continue;
        }
      } catch (error: any) {
        lastError = error;
        this.markProviderUnhealthy(provider);
        
        // If circuit is open, try next provider immediately
        if (error.circuitState === 'OPEN') {
          logger.warn(`Circuit breaker open for ${provider.name}, trying next provider`);
          continue;
        }

        // If this is the last provider, throw the error
        if (providerAttempt === maxProviderAttempts - 1) {
          throw error;
        }
      }
    }

    throw lastError || new Error('All RPC providers failed');
  }

  /**
   * Execute a single RPC call
   */
  private async executeSingleRPCCall<T>(
    url: string,
    method: string,
    params: any,
    options: RPCCallOptions
  ): Promise<T> {
    const timeout = options.timeout || 5000;
    const startTime = Date.now();

    try {
      const response = await axios.post(
        url,
        {
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params,
        },
        {
          timeout,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
        }
      );

      const duration = Date.now() - startTime;
      logger.debug(`RPC call to ${url} completed in ${duration}ms`);

      if (response.data.error) {
        throw new Error(
          `RPC Error: ${response.data.error.message || JSON.stringify(response.data.error)}`
        );
      }

      return response.data.result as T;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        
        if (axiosError.code === 'ECONNABORTED') {
          throw new Error('TIMEOUT');
        }
        
        if (axiosError.response) {
          throw new Error(`HTTP ${axiosError.response.status}: ${axiosError.response.statusText}`);
        }
        
        throw new Error(axiosError.code || 'NETWORK_ERROR');
      }

      throw error;
    }
  }

  /**
   * Get next available provider (round-robin)
   */
  private getNextProvider(): RPCProvider | null {
    const healthyProviders = this.providers.filter((p) => p.isHealthy);
    
    if (healthyProviders.length === 0) {
      // If no healthy providers, try all providers again
      logger.warn('No healthy RPC providers, resetting all to healthy');
      this.providers.forEach((p) => {
        p.isHealthy = true;
        p.failures = 0;
      });
      return this.providers[0] || null;
    }

    const provider = healthyProviders[this.currentProviderIndex % healthyProviders.length];
    this.currentProviderIndex = (this.currentProviderIndex + 1) % healthyProviders.length;
    
    return provider;
  }

  /**
   * Mark provider as healthy
   */
  private markProviderHealthy(provider: RPCProvider): void {
    provider.isHealthy = true;
    provider.failures = 0;
    provider.lastCheck = new Date();
  }

  /**
   * Mark provider as unhealthy
   */
  private markProviderUnhealthy(provider: RPCProvider): void {
    provider.failures++;
    provider.lastCheck = new Date();
    
    if (provider.failures >= 3) {
      provider.isHealthy = false;
      logger.warn(`Provider ${provider.url} marked as unhealthy after ${provider.failures} failures`);
    }
  }

  /**
   * Get provider statistics
   */
  getProviderStats(): Array<{
    url: string;
    name: string;
    isHealthy: boolean;
    failures: number;
    lastCheck: Date | null;
    circuitState: string;
  }> {
    return this.providers.map((p) => ({
      url: p.url,
      name: p.name,
      isHealthy: p.isHealthy,
      failures: p.failures,
      lastCheck: p.lastCheck,
      circuitState: circuitBreakerService.getStats(p.name)?.state || 'UNKNOWN',
    }));
  }

  /**
   * Reset all providers
   */
  resetProviders(): void {
    this.providers.forEach((p) => {
      p.isHealthy = true;
      p.failures = 0;
      circuitBreakerService.reset(p.name);
    });
    
    logger.info('All RPC providers reset');
  }

  /**
   * Add a new provider
   */
  addProvider(url: string): void {
    const name = `rpc-provider-${this.providers.length}`;
    this.providers.push({
      url,
      name,
      isHealthy: true,
      failures: 0,
      lastCheck: null,
    });
    
    logger.info(`Added RPC provider: ${url}`);
  }

  /**
   * Remove a provider
   */
  removeProvider(url: string): void {
    const index = this.providers.findIndex((p) => p.url === url);
    if (index !== -1) {
      const provider = this.providers[index];
      circuitBreakerService.remove(provider.name);
      this.providers.splice(index, 1);
      logger.info(`Removed RPC provider: ${url}`);
    }
  }
}

interface RPCProvider {
  url: string;
  name: string;
  isHealthy: boolean;
  failures: number;
  lastCheck: Date | null;
}

interface RPCCallOptions {
  timeout?: number;
  headers?: Record<string, string>;
  retryConfig?: Partial<import('@/types/retry').RetryConfig>;
}

// Export singleton instance
export const enhancedRPCService = new EnhancedRPCService(
  (process.env.STELLAR_RPC_URLS || process.env.STELLAR_RPC_URL || '')
    .split(',')
    .filter(Boolean)
);
