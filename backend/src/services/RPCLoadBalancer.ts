import axios from 'axios';
import { logger } from '@/utils/logger';

interface RPCProvider {
  url: string;
  priority: number;
  isHealthy: boolean;
  lastChecked: Date | null;
  responseTime: number;
  failures: number;
}

export class RPCLoadBalancer {
  private providers: RPCProvider[] = [];
  private currentIndex: number = 0;
  private checkInterval: number = 30000; // 30 seconds
  private timeout: number = 5000; // 5 seconds
  private maxFailures: number = 3;
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(providerUrls: string[] = []) {
    this.initializeProviders(providerUrls);
  }

  /**
   * Initialize RPC providers with priorities
   */
  private initializeProviders(urls: string[]): void {
    this.providers = urls.map((url, index) => ({
      url,
      priority: index + 1,
      isHealthy: true,
      lastChecked: null,
      responseTime: 0,
      failures: 0,
    }));

    // Sort by priority
    this.providers.sort((a, b) => a.priority - b.priority);
    
    logger.info(`Initialized ${this.providers.length} RPC providers`);
  }

  /**
   * Start health checking
   */
  start(): void {
    this.startHealthChecks();
  }

  /**
   * Stop health checking
   */
  stop(): void {
    if (this.healthCheckTimer) {
      clearTimeout(this.healthCheckTimer);
    }
    logger.info('RPC Load Balancer stopped');
  }

  /**
   * Get the best available RPC provider
   */
  getBestProvider(): string | null {
    const healthyProviders = this.providers.filter(p => p.isHealthy);
    
    if (healthyProviders.length === 0) {
      logger.warn('No healthy RPC providers available');
      return null;
    }

    // Return provider with lowest response time among healthy ones
    const bestProvider = healthyProviders.reduce((best, current) => 
      current.responseTime < best.responseTime ? current : best
    );

    logger.debug(`Selected RPC provider: ${bestProvider.url} (${bestProvider.responseTime}ms)`);
    return bestProvider.url;
  }

  /**
   * Get a provider using round-robin fallback
   */
  getNextProvider(): string | null {
    const healthyProviders = this.providers.filter(p => p.isHealthy);
    
    if (healthyProviders.length === 0) {
      return null;
    }

    const provider = healthyProviders[this.currentIndex % healthyProviders.length];
    this.currentIndex = (this.currentIndex + 1) % healthyProviders.length;
    
    return provider.url;
  }

  /**
   * Make RPC call with automatic failover
   */
  async makeRPCCall<T>(method: string, params: any = {}): Promise<T | null> {
    const maxRetries = this.providers.length;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const providerUrl = this.getBestProvider() || this.getNextProvider();
      
      if (!providerUrl) {
        throw new Error('No RPC providers available');
      }

      try {
        const startTime = Date.now();
        const response = await axios.post(providerUrl, {
          jsonrpc: '2.0',
          id: 1,
          method,
          params,
        }, {
          timeout: this.timeout,
          headers: { 'Content-Type': 'application/json' },
        });

        // Update provider stats
        const responseTime = Date.now() - startTime;
        this.updateProviderStats(providerUrl, true, responseTime);

        return response.data.result as T;
      } catch (error: any) {
        lastError = error;
        logger.warn(`RPC call failed to ${providerUrl}:`, error.message);
        this.updateProviderStats(providerUrl, false, 0);
        
        // Try next provider
        continue;
      }
    }

    logger.error('All RPC providers failed');
    throw lastError || new Error('All RPC providers unavailable');
  }

  /**
   * Update provider statistics
   */
  private updateProviderStats(url: string, success: boolean, responseTime: number): void {
    const provider = this.providers.find(p => p.url === url);
    if (!provider) return;

    provider.lastChecked = new Date();
    
    if (success) {
      provider.responseTime = responseTime;
      provider.failures = 0;
      provider.isHealthy = true;
    } else {
      provider.failures++;
      if (provider.failures >= this.maxFailures) {
        provider.isHealthy = false;
        logger.warn(`Provider ${url} marked as unhealthy after ${provider.failures} failures`);
      }
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    const checkHealth = async () => {
      await Promise.all(this.providers.map(async (provider) => {
        try {
          const startTime = Date.now();
          await axios.post(provider.url, {
            jsonrpc: '2.0',
            id: 1,
            method: 'getNetwork',
            params: {},
          }, {
            timeout: this.timeout,
          });

          const responseTime = Date.now() - startTime;
          this.updateProviderStats(provider.url, true, responseTime);
          logger.debug(`Health check passed for ${provider.url} (${responseTime}ms)`);
        } catch (error: any) {
          this.updateProviderStats(provider.url, false, 0);
          logger.warn(`Health check failed for ${provider.url}:`, error.message);
        }
      }));

      this.healthCheckTimer = setTimeout(checkHealth, this.checkInterval);
    };

    checkHealth();
    logger.info('Started RPC provider health checks');
  }

  /**
   * Add a new provider dynamically
   */
  addProvider(url: string, priority?: number): void {
    const existingProvider = this.providers.find(p => p.url === url);
    if (existingProvider) {
      logger.warn(`Provider ${url} already exists`);
      return;
    }

    this.providers.push({
      url,
      priority: priority || this.providers.length + 1,
      isHealthy: true,
      lastChecked: null,
      responseTime: 0,
      failures: 0,
    });

    this.providers.sort((a, b) => a.priority - b.priority);
    logger.info(`Added RPC provider: ${url}`);
  }

  /**
   * Remove a provider
   */
  removeProvider(url: string): void {
    const index = this.providers.findIndex(p => p.url === url);
    if (index === -1) {
      logger.warn(`Provider ${url} not found`);
      return;
    }

    this.providers.splice(index, 1);
    logger.info(`Removed RPC provider: ${url}`);
  }

  /**
   * Get provider statistics
   */
  getProviderStats(): Array<{
    url: string;
    priority: number;
    isHealthy: boolean;
    responseTime: number;
    failures: number;
    lastChecked: Date | null;
  }> {
    return this.providers.map(p => ({
      url: p.url,
      priority: p.priority,
      isHealthy: p.isHealthy,
      responseTime: p.responseTime,
      failures: p.failures,
      lastChecked: p.lastChecked,
    }));
  }

  /**
   * Get overall load balancer status
   */
  getStatus(): {
    totalProviders: number;
    healthyProviders: number;
    currentProvider: string | null;
    averageResponseTime: number;
  } {
    const healthyProviders = this.providers.filter(p => p.isHealthy);
    const avgResponseTime = healthyProviders.length > 0
      ? healthyProviders.reduce((sum, p) => sum + p.responseTime, 0) / healthyProviders.length
      : 0;

    return {
      totalProviders: this.providers.length,
      healthyProviders: healthyProviders.length,
      currentProvider: this.getBestProvider(),
      averageResponseTime: Math.round(avgResponseTime),
    };
  }
}
