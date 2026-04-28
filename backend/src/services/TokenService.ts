import { logger } from '@/utils/logger';
import axios from 'axios';
import { circuitBreakerService } from './CircuitBreakerService';
import { retryService } from './RetryService';
import { RPC_RETRY_CONFIG } from '@/config/retryConfig';
import { RetryStrategy, JitterType } from '@/types/retry';

interface TokenInfo {
  contractId: string;
  symbol: string;
  name: string;
  decimals: number;
  iconUrl?: string;
  isVerified: boolean;
}

interface TokenBalance {
  contractId: string;
  amount: bigint;
  tokenInfo: TokenInfo;
}

interface PriceData {
  [symbol: string]: {
    usd: number;
    usd_24h_change?: number;
  };
}

export class TokenService {
  private coingeckoApiUrl = 'https://api.coingecko.com/api/v3';
  private stellarRpcUrl: string;
  private readonly rpcCircuitName = 'token-service-rpc';
  private readonly priceCircuitName = 'token-service-price';
  private priceCache: Map<string, { data: PriceData; timestamp: number }> = new Map();
  
  // Known tokens on Stellar
  private knownTokens: Map<string, TokenInfo> = new Map([
    ['XLM', {
      contractId: 'native',
      symbol: 'XLM',
      name: 'Stellar Lumens',
      decimals: 7,
      iconUrl: 'https://assets.coingecko.com/coins/images/100/small/Stellar_symbol_black_RGB.png',
      isVerified: true,
    }],
    ['USDC', {
      contractId: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      iconUrl: 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png',
      isVerified: true,
    }],
    ['yXLM', {
      contractId: 'GBVOL67TMUQBGL4TZYNMY3ZQ5WGQYFPFD5VJRWXR72VA33VFNL225PL5',
      symbol: 'yXLM',
      name: 'Yield XLM',
      decimals: 7,
      iconUrl: '',
      isVerified: true,
    }],
  ]);

  constructor() {
    this.stellarRpcUrl = process.env.STELLAR_RPC_URL || 'https://soroban-futurenet.stellar.org';
  }

  /**
   * Fetch all token balances for a wallet
   */
  async getTokenBalances(walletAddress: string): Promise<TokenBalance[]> {
    try {
      const balances: TokenBalance[] = [];

      // Fetch native XLM balance
      const xlmBalance = await this.getNativeBalance(walletAddress);
      if (xlmBalance > 0n) {
        const xlmInfo = this.knownTokens.get('XLM')!;
        balances.push({
          contractId: 'native',
          amount: xlmBalance,
          tokenInfo: xlmInfo,
        });
      }

      // Fetch SAC (Stellar Asset Contract) tokens
      const sacBalances = await this.getSACTokenBalances(walletAddress);
      balances.push(...sacBalances);

      return balances;
    } catch (error) {
      logger.error('Error fetching token balances:', error);
      throw new Error('Failed to fetch token balances');
    }
  }

  /**
   * Get native XLM balance
   */
  private async getNativeBalance(address: string): Promise<bigint> {
    try {
      const result = await this.executeRPCWithCircuitBreaker(async () => {
        const response = await axios.post(this.stellarRpcUrl, {
          jsonrpc: '2.0',
          id: 1,
          method: 'getLedgerEntries',
          params: {
            keys: [this.createAccountKey(address)],
          },
        });

        if (!response.data.result?.entries?.[0]) {
          return 0n;
        }

        // Parse XDR and extract balance
        const entry = response.data.result.entries[0];
        const accountData = this.parseAccountEntry(entry.xdr);
        
        return BigInt(accountData.balance);
      });

      return result;
    } catch (error) {
      logger.error('Error fetching native balance:', error);
      return 0n; // Fallback to 0 balance
    }
  }

  /**
   * Fetch SAC token balances
   */
  private async getSACTokenBalances(walletAddress: string): Promise<TokenBalance[]> {
    try {
      // Query event logs or use token registry to discover tokens
      // This is a simplified version - in production you'd query a token registry
      const balances: TokenBalance[] = [];

      // Check for known tokens
      for (const [symbol, tokenInfo] of this.knownTokens.entries()) {
        if (symbol === 'XLM') continue; // Skip native token

        const balance = await this.getTokenBalanceForContract(
          walletAddress,
          tokenInfo.contractId
        );

        if (balance > 0n) {
          balances.push({
            contractId: tokenInfo.contractId,
            amount: balance,
            tokenInfo,
          });
        }
      }

      return balances;
    } catch (error) {
      logger.error('Error fetching SAC token balances:', error);
      return [];
    }
  }

  /**
   * Get balance for a specific token contract
   */
  private async getTokenBalanceForContract(
    walletAddress: string,
    tokenContractId: string
  ): Promise<bigint> {
    try {
      const result = await this.executeRPCWithCircuitBreaker(async () => {
        const response = await axios.post(this.stellarRpcUrl, {
          jsonrpc: '2.0',
          id: 1,
          method: 'invokeContractRead',
          params: {
            contract_id: tokenContractId,
            function_name: 'balance',
            args: [walletAddress],
          },
        });

        if (!response.data.result?.result) {
          return 0n;
        }

        return BigInt(response.data.result.result);
      });

      return result;
    } catch (error) {
      // Token might not exist or not support standard interface
      return 0n;
    }
  }

  /**
   * Fetch USD prices for tokens from CoinGecko
   */
  async getTokenPrices(symbols: string[]): Promise<PriceData> {
    try {
      // Check cache first (5 minute TTL)
      const cacheKey = symbols.sort().join(',');
      const cached = this.priceCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
        logger.debug('Returning cached price data');
        return cached.data;
      }

      // Map Stellar symbols to CoinGecko IDs
      const coinGeckoIds: Map<string, string> = new Map([
        ['XLM', 'stellar'],
        ['USDC', 'usd-coin'],
        ['yXLM', 'yield-yak-staked-avax'], // Adjust as needed
      ]);

      const ids = symbols
        .map(s => coinGeckoIds.get(s))
        .filter(id => id !== undefined)
        .join(',');

      if (!ids) {
        return {};
      }

      const priceData = await circuitBreakerService.execute(
        this.priceCircuitName,
        async () => {
          const result = await retryService.executeWithRetry(
            async () => {
              const response = await axios.get(`${this.coingeckoApiUrl}/simple/price`, {
                params: {
                  ids,
                  vs_currencies: 'usd',
                  include_24hr_change: true,
                },
                timeout: 5000,
              });

              // Map back to our symbols
              const data: PriceData = {};
              for (const [symbol, coinId] of coinGeckoIds.entries()) {
                if (response.data[coinId]) {
                  data[symbol] = response.data[coinId];
                }
              }

              return data;
            },
            {
              maxAttempts: 3,
              initialDelay: 1000,
              maxDelay: 5000,
              strategy: RetryStrategy.EXPONENTIAL,
              jitterType: JitterType.FULL,
              backoffMultiplier: 2,
              onRetry: (attempt, error, delay) => {
                logger.warn(
                  `Price fetch failed (attempt ${attempt}): ${error.message}. ` +
                  `Retrying in ${delay}ms...`
                );
              },
            }
          );

          if (!result.success) {
            throw result.error || new Error('Price fetch failed');
          }

          return result.result!;
        },
        {
          failureThreshold: 5,
          successThreshold: 2,
          timeout: 60000, // 1 minute
          monitoringPeriod: 120000, // 2 minutes
        }
      );

      // Cache the result
      this.priceCache.set(cacheKey, {
        data: priceData,
        timestamp: Date.now(),
      });

      return priceData;
    } catch (error: any) {
      logger.error('Error fetching token prices:', error);
      
      // Fallback: Return cached data even if stale
      const cacheKey = symbols.sort().join(',');
      const cached = this.priceCache.get(cacheKey);
      if (cached) {
        logger.warn('Returning stale cached price data as fallback');
        return cached.data;
      }
      
      return {};
    }
  }

  /**
   * Calculate total portfolio value in USD
   */
  async calculatePortfolioValue(balances: TokenBalance[]): Promise<{
    totalUsd: number;
    breakdown: Array<{
      symbol: string;
      amount: string;
      valueUsd: number;
      percentage: number;
    }>;
  }> {
    const symbols = balances.map(b => b.tokenInfo.symbol);
    const prices = await this.getTokenPrices(symbols);

    let totalUsd = 0;
    const breakdown: Array<{
      symbol: string;
      amount: string;
      valueUsd: number;
      percentage: number;
    }> = [];

    for (const balance of balances) {
      const price = prices[balance.tokenInfo.symbol]?.usd || 0;
      const amountInToken = Number(balance.amount) / Math.pow(10, balance.tokenInfo.decimals);
      const valueUsd = amountInToken * price;
      
      totalUsd += valueUsd;
      
      breakdown.push({
        symbol: balance.tokenInfo.symbol,
        amount: amountInToken.toString(),
        valueUsd,
        percentage: 0, // Will calculate after total is known
      });
    }

    // Calculate percentages
    breakdown.forEach(item => {
      item.percentage = totalUsd > 0 ? (item.valueUsd / totalUsd) * 100 : 0;
    });

    return {
      totalUsd,
      breakdown,
    };
  }

  /**
   * Discover custom/unrecognized tokens by scanning events
   */
  async discoverCustomTokens(walletAddress: string): Promise<TokenInfo[]> {
    try {
      // Query transfer events to discover tokens
      const response = await axios.post(this.stellarRpcUrl, {
        jsonrpc: '2.0',
        id: 1,
        method: 'getEvents',
        params: {
          start_ledger: 1,
          filters: [{
            type: 'contract',
            contract_ids: [],
            topics: [['transfer', walletAddress]],
          }],
        },
      });

      const customTokens: TokenInfo[] = [];
      const discoveredContracts = new Set<string>();

      // Extract unique token contracts from events
      if (response.data.result?.events) {
        for (const event of response.data.result.events) {
          const contractId = event.contract_id;
          if (!discoveredContracts.has(contractId) && !this.isKnownToken(contractId)) {
            const tokenInfo = await this.fetchTokenInfo(contractId);
            if (tokenInfo) {
              customTokens.push(tokenInfo);
              discoveredContracts.add(contractId);
            }
          }
        }
      }

      return customTokens;
    } catch (error) {
      logger.error('Error discovering custom tokens:', error);
      return [];
    }
  }

  /**
   * Fetch token info from contract
   */
  private async fetchTokenInfo(contractId: string): Promise<TokenInfo | null> {
    try {
      return await this.executeRPCWithCircuitBreaker(async () => {
        const [metadataResponse, decimalsResponse] = await Promise.all([
          axios.post(this.stellarRpcUrl, {
            jsonrpc: '2.0',
            id: 1,
            method: 'invokeContractRead',
            params: {
              contract_id: contractId,
              function_name: 'metadata',
              args: [],
            },
          }),
          axios.post(this.stellarRpcUrl, {
            jsonrpc: '2.0',
            id: 1,
            method: 'invokeContractRead',
            params: {
              contract_id: contractId,
              function_name: 'decimals',
              args: [],
            },
          }),
        ]);

        const metadata = metadataResponse.data.result?.result || {};
        const decimals = parseInt(decimalsResponse.data.result?.result || '7');

        return {
          contractId,
          symbol: metadata.symbol || 'UNKNOWN',
          name: metadata.name || 'Unknown Token',
          decimals,
          iconUrl: '',
          isVerified: false,
        };
      });
    } catch (error) {
      logger.error('Error fetching token info:', error);
      return null;
    }
  }

  /**
   * Execute RPC call with circuit breaker protection
   */
  private async executeRPCWithCircuitBreaker<T>(fn: () => Promise<T>): Promise<T> {
    return await circuitBreakerService.execute(
      this.rpcCircuitName,
      async () => {
        const result = await retryService.executeWithRetry(
          fn,
          {
            ...RPC_RETRY_CONFIG,
            onRetry: (attempt, error, delay) => {
              logger.warn(
                `Token RPC call failed (attempt ${attempt}): ${error.message}. ` +
                `Retrying in ${delay}ms...`
              );
            },
          }
        );

        if (!result.success) {
          throw result.error || new Error('RPC call failed');
        }

        return result.result!;
      },
      {
        failureThreshold: 10,
        successThreshold: 3,
        timeout: 30000,
        monitoringPeriod: 60000,
      }
    );
  }

  /**
   * Get service health status
   */
  getHealthStatus(): {
    rpcCircuitState: string;
    priceCircuitState: string;
    cachedPrices: number;
    isHealthy: boolean;
  } {
    const rpcStats = circuitBreakerService.getStats(this.rpcCircuitName);
    const priceStats = circuitBreakerService.getStats(this.priceCircuitName);
    
    return {
      rpcCircuitState: rpcStats?.state || 'UNKNOWN',
      priceCircuitState: priceStats?.state || 'UNKNOWN',
      cachedPrices: this.priceCache.size,
      isHealthy: 
        (rpcStats?.state === 'CLOSED' || rpcStats?.state === 'HALF_OPEN') &&
        (priceStats?.state === 'CLOSED' || priceStats?.state === 'HALF_OPEN'),
    };
  }

  /**
   * Check if a token is in our known list
   */
  private isKnownToken(contractId: string): boolean {
    for (const token of this.knownTokens.values()) {
      if (token.contractId === contractId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Helper: Create account key for ledger query
   */
  private createAccountKey(address: string): string {
    // In production, properly encode to XDR
    return address;
  }

  /**
   * Helper: Parse account entry XDR
   */
  private parseAccountEntry(xdrData: string): any {
    // In production, properly decode XDR using stellar-sdk
    return { balance: 0 };
  }
}
