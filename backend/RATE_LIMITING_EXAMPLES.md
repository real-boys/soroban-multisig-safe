# Rate Limiting Examples

This document provides practical examples of using the rate limiting system.

## Table of Contents
- [Basic Usage](#basic-usage)
- [Client Integration](#client-integration)
- [Admin Operations](#admin-operations)
- [Monitoring](#monitoring)
- [Error Handling](#error-handling)

## Basic Usage

### 1. Making Rate-Limited Requests

#### Authenticated Request
```javascript
const response = await fetch('https://api.example.com/api/v1/wallets', {
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN_HERE'
  }
});

// Check rate limit headers
console.log('Tier:', response.headers.get('X-RateLimit-Tier'));
console.log('Limit:', response.headers.get('X-RateLimit-Limit'));
console.log('Remaining:', response.headers.get('X-RateLimit-Remaining'));
console.log('Reset:', response.headers.get('X-RateLimit-Reset'));
```

#### Unauthenticated Request (IP-based)
```javascript
const response = await fetch('https://api.example.com/api/v1/rate-limit/tiers');

// IP-based rate limiting applies (FREE tier)
console.log('Remaining:', response.headers.get('X-RateLimit-Remaining'));
```

### 2. Checking Rate Limit Status

```javascript
async function checkRateLimitStatus(token) {
  const response = await fetch('https://api.example.com/api/v1/rate-limit/status', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const data = await response.json();
  
  if (data.success) {
    const { tier, config, usage } = data.data;
    
    console.log(`Current Tier: ${tier}`);
    console.log(`Requests per minute: ${config.requestsPerMinute}`);
    console.log(`Remaining today: ${usage.dayRemaining}`);
    
    // Calculate usage percentage
    const usagePercent = (usage.dayCount / config.requestsPerDay) * 100;
    console.log(`Daily usage: ${usagePercent.toFixed(2)}%`);
  }
}
```

### 3. Handling Rate Limit Errors

```javascript
async function makeRequestWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      // Rate limit exceeded
      const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
      console.log(`Rate limited. Retrying after ${retryAfter} seconds...`);
      
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      continue;
    }
    
    return response;
  }
  
  throw new Error('Max retries exceeded');
}
```

## Client Integration

### React Hook for Rate Limiting

```typescript
import { useState, useEffect } from 'react';

interface RateLimitInfo {
  tier: string;
  limit: number;
  remaining: number;
  reset: number;
  degraded: boolean;
  degradationMessage?: string;
}

export function useRateLimit(token: string) {
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRateLimitStatus() {
      try {
        const response = await fetch('/api/v1/rate-limit/status', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const data = await response.json();
        
        if (data.success) {
          const { tier, config, usage } = data.data;
          setRateLimitInfo({
            tier,
            limit: config.requestsPerMinute,
            remaining: usage.minuteRemaining,
            reset: usage.minuteReset,
            degraded: false, // Would come from response headers
          });
        }
      } catch (error) {
        console.error('Failed to fetch rate limit status:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchRateLimitStatus();
    
    // Refresh every minute
    const interval = setInterval(fetchRateLimitStatus, 60000);
    return () => clearInterval(interval);
  }, [token]);

  return { rateLimitInfo, loading };
}
```

### Rate Limit Display Component

```typescript
import React from 'react';
import { useRateLimit } from './useRateLimit';

export function RateLimitDisplay({ token }: { token: string }) {
  const { rateLimitInfo, loading } = useRateLimit(token);

  if (loading) return <div>Loading...</div>;
  if (!rateLimitInfo) return null;

  const usagePercent = ((rateLimitInfo.limit - rateLimitInfo.remaining) / rateLimitInfo.limit) * 100;
  const isWarning = usagePercent >= 80;
  const isCritical = usagePercent >= 95;

  return (
    <div className={`rate-limit-display ${isCritical ? 'critical' : isWarning ? 'warning' : ''}`}>
      <h3>Rate Limit Status</h3>
      <p>Tier: <strong>{rateLimitInfo.tier}</strong></p>
      <p>Remaining: <strong>{rateLimitInfo.remaining}</strong> / {rateLimitInfo.limit}</p>
      
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${usagePercent}%` }}
        />
      </div>
      
      {rateLimitInfo.degraded && (
        <div className="degradation-warning">
          ⚠️ {rateLimitInfo.degradationMessage}
        </div>
      )}
      
      {isCritical && (
        <button onClick={() => window.location.href = '/upgrade'}>
          Upgrade Tier
        </button>
      )}
    </div>
  );
}
```

### Axios Interceptor

```javascript
import axios from 'axios';

// Create axios instance
const api = axios.create({
  baseURL: 'https://api.example.com'
});

// Response interceptor to handle rate limiting
api.interceptors.response.use(
  (response) => {
    // Store rate limit info from headers
    const rateLimitInfo = {
      tier: response.headers['x-ratelimit-tier'],
      limit: parseInt(response.headers['x-ratelimit-limit']),
      remaining: parseInt(response.headers['x-ratelimit-remaining']),
      reset: parseInt(response.headers['x-ratelimit-reset']),
      degraded: response.headers['x-ratelimit-degraded'] === 'true',
    };
    
    // Store in localStorage or state management
    localStorage.setItem('rateLimitInfo', JSON.stringify(rateLimitInfo));
    
    // Warn user if approaching limit
    if (rateLimitInfo.remaining < 10) {
      console.warn('Approaching rate limit!', rateLimitInfo);
    }
    
    return response;
  },
  async (error) => {
    if (error.response?.status === 429) {
      const retryAfter = parseInt(error.response.headers['retry-after'] || '60');
      
      // Show user-friendly message
      console.error(`Rate limit exceeded. Please wait ${retryAfter} seconds.`);
      
      // Optionally retry after delay
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      return api.request(error.config);
    }
    
    return Promise.reject(error);
  }
);

export default api;
```

## Admin Operations

### 1. Update User Tier

```javascript
async function upgradeUserTier(adminToken, userId, newTier) {
  const response = await fetch('https://api.example.com/api/v1/rate-limit/admin/user/tier', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: userId,
      tier: newTier // 'FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE'
    })
  });

  const data = await response.json();
  
  if (data.success) {
    console.log(`User ${userId} upgraded to ${newTier}`);
  } else {
    console.error('Failed to upgrade user:', data.error);
  }
}

// Example usage
upgradeUserTier('admin-token', 'user-123', 'PREMIUM');
```

### 2. Get User Statistics

```javascript
async function getUserRateLimitStats(adminToken, userId) {
  const response = await fetch(
    `https://api.example.com/api/v1/rate-limit/admin/user/${userId}/stats`,
    {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    }
  );

  const data = await response.json();
  
  if (data.success) {
    const { tier, config, stats } = data.data;
    
    console.log('User Rate Limit Statistics:');
    console.log('Tier:', tier);
    console.log('Minute usage:', stats.minuteCount, '/', config.requestsPerMinute);
    console.log('Hour usage:', stats.hourCount, '/', config.requestsPerHour);
    console.log('Day usage:', stats.dayCount, '/', config.requestsPerDay);
    console.log('Violations:', stats.violations);
  }
}
```

### 3. Reset User Rate Limit

```javascript
async function resetUserRateLimit(adminToken, userId) {
  const response = await fetch(
    `https://api.example.com/api/v1/rate-limit/admin/user/${userId}/reset`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    }
  );

  const data = await response.json();
  
  if (data.success) {
    console.log(`Rate limit reset for user ${userId}`);
  }
}
```

### 4. Bulk Tier Updates

```javascript
async function bulkUpgradeUsers(adminToken, userIds, newTier) {
  const results = await Promise.allSettled(
    userIds.map(userId => 
      fetch('https://api.example.com/api/v1/rate-limit/admin/user/tier', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId, tier: newTier })
      })
    )
  );

  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  
  console.log(`Upgraded ${successful} users, ${failed} failed`);
}
```

## Monitoring

### 1. Rate Limit Dashboard Data

```javascript
async function getRateLimitDashboardData(adminToken) {
  // Get all users' rate limit stats
  const users = await fetchAllUsers(adminToken);
  
  const stats = await Promise.all(
    users.map(async (user) => {
      const response = await fetch(
        `https://api.example.com/api/v1/rate-limit/admin/user/${user.id}/stats`,
        {
          headers: { 'Authorization': `Bearer ${adminToken}` }
        }
      );
      return response.json();
    })
  );

  // Aggregate statistics
  const tierDistribution = stats.reduce((acc, stat) => {
    const tier = stat.data.tier;
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, {});

  const totalViolations = stats.reduce((sum, stat) => 
    sum + (stat.data.stats?.violations || 0), 0
  );

  return {
    tierDistribution,
    totalViolations,
    totalUsers: users.length,
  };
}
```

### 2. Real-time Monitoring

```javascript
// WebSocket connection for real-time rate limit events
const ws = new WebSocket('wss://api.example.com/ws/rate-limit-monitor');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'RATE_LIMIT_EXCEEDED':
      console.log(`User ${data.userId} exceeded rate limit`);
      break;
      
    case 'USER_BANNED':
      console.log(`User ${data.userId} temporarily banned`);
      break;
      
    case 'DEGRADATION_WARNING':
      console.log(`User ${data.userId} in degradation mode`);
      break;
  }
};
```

## Error Handling

### Comprehensive Error Handler

```javascript
class RateLimitError extends Error {
  constructor(message, retryAfter, rateLimitInfo) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    this.rateLimitInfo = rateLimitInfo;
  }
}

async function makeApiRequest(url, options) {
  try {
    const response = await fetch(url, options);
    
    // Check for rate limiting
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
      const rateLimitInfo = {
        tier: response.headers.get('X-RateLimit-Tier'),
        limit: parseInt(response.headers.get('X-RateLimit-Limit')),
        remaining: 0,
        reset: parseInt(response.headers.get('X-RateLimit-Reset')),
      };
      
      throw new RateLimitError(
        'Rate limit exceeded',
        retryAfter,
        rateLimitInfo
      );
    }
    
    return response.json();
  } catch (error) {
    if (error instanceof RateLimitError) {
      // Handle rate limit error
      console.error(`Rate limited. Retry after ${error.retryAfter}s`);
      
      // Show user notification
      showNotification({
        type: 'warning',
        message: `You've reached your rate limit. Please wait ${error.retryAfter} seconds.`,
        action: {
          label: 'Upgrade',
          onClick: () => window.location.href = '/upgrade'
        }
      });
      
      throw error;
    }
    
    // Handle other errors
    throw error;
  }
}
```

### Graceful Degradation Handler

```javascript
function handleDegradation(response) {
  const degraded = response.headers.get('X-RateLimit-Degraded') === 'true';
  const message = response.headers.get('X-RateLimit-Degradation-Message');
  const remaining = parseInt(response.headers.get('X-RateLimit-Remaining'));
  
  if (degraded) {
    // Show warning to user
    if (remaining < 5) {
      showNotification({
        type: 'error',
        message: message || 'Critical: Rate limit almost exceeded!',
        persistent: true
      });
    } else if (remaining < 20) {
      showNotification({
        type: 'warning',
        message: message || 'Warning: Approaching rate limit',
      });
    } else {
      showNotification({
        type: 'info',
        message: message || 'Notice: High API usage',
      });
    }
    
    // Optionally throttle client-side requests
    enableClientSideThrottling();
  }
}
```

## Best Practices

### 1. Client-Side Request Throttling

```javascript
class ThrottledApiClient {
  constructor(maxRequestsPerSecond = 5) {
    this.queue = [];
    this.processing = false;
    this.interval = 1000 / maxRequestsPerSecond;
  }

  async request(url, options) {
    return new Promise((resolve, reject) => {
      this.queue.push({ url, options, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    const { url, options, resolve, reject } = this.queue.shift();
    
    try {
      const response = await fetch(url, options);
      resolve(response);
    } catch (error) {
      reject(error);
    }
    
    setTimeout(() => {
      this.processing = false;
      this.processQueue();
    }, this.interval);
  }
}

const api = new ThrottledApiClient(5); // 5 requests per second
```

### 2. Caching to Reduce API Calls

```javascript
class CachedApiClient {
  constructor(cacheDuration = 60000) {
    this.cache = new Map();
    this.cacheDuration = cacheDuration;
  }

  async get(url, options) {
    const cacheKey = `${url}:${JSON.stringify(options)}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      return cached.data;
    }
    
    const response = await fetch(url, options);
    const data = await response.json();
    
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
    
    return data;
  }
}
```

### 3. Progressive Backoff

```javascript
async function requestWithBackoff(url, options, maxRetries = 5) {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
        const backoffTime = Math.min(retryAfter * 1000 * Math.pow(2, retries), 300000);
        
        console.log(`Backing off for ${backoffTime}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        
        retries++;
        continue;
      }
      
      return response;
    } catch (error) {
      if (retries === maxRetries - 1) throw error;
      retries++;
    }
  }
  
  throw new Error('Max retries exceeded');
}
```

## Testing

### Unit Test Example

```javascript
describe('Rate Limit Client', () => {
  it('should handle rate limit errors', async () => {
    // Mock fetch to return 429
    global.fetch = jest.fn().mockResolvedValue({
      status: 429,
      headers: new Map([
        ['Retry-After', '60'],
        ['X-RateLimit-Tier', 'FREE']
      ])
    });

    await expect(makeApiRequest('/api/test')).rejects.toThrow(RateLimitError);
  });

  it('should retry after rate limit', async () => {
    jest.useFakeTimers();
    
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ status: 429, headers: new Map([['Retry-After', '1']]) })
      .mockResolvedValueOnce({ status: 200, json: async () => ({ success: true }) });

    const promise = requestWithBackoff('/api/test');
    
    jest.advanceTimersByTime(1000);
    
    const result = await promise;
    expect(result.status).toBe(200);
    
    jest.useRealTimers();
  });
});
```

This comprehensive guide should help you integrate and use the rate limiting system effectively!
