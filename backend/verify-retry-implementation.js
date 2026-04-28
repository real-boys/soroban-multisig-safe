#!/usr/bin/env node

/**
 * Verification script for Retry Implementation
 * Run with: node verify-retry-implementation.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Retry Implementation...\n');

const checks = {
  passed: 0,
  failed: 0,
  warnings: 0
};

function check(name, condition, message) {
  if (condition) {
    console.log(`✅ ${name}`);
    checks.passed++;
  } else {
    console.log(`❌ ${name}: ${message}`);
    checks.failed++;
  }
}

function warn(name, message) {
  console.log(`⚠️  ${name}: ${message}`);
  checks.warnings++;
}

// Check 1: Required files exist
console.log('📁 Checking files...');
const requiredFiles = [
  'src/types/retry.ts',
  'src/config/retryConfig.ts',
  'src/services/RetryService.ts',
  'src/services/CircuitBreakerService.ts',
  'src/services/DeadLetterQueueService.ts',
  'src/services/EnhancedRPCService.ts',
  'src/controllers/RetryController.ts',
  'src/routes/retry.ts',
  'src/tests/retry.test.ts',
  'prisma/migrations/add_dead_letter_queue.sql'
];

requiredFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  check(
    `File exists: ${file}`,
    fs.existsSync(filePath),
    'File not found'
  );
});

console.log('\n📝 Checking file contents...');

// Check 2: Types are properly defined
const typesFile = path.join(__dirname, 'src/types/retry.ts');
if (fs.existsSync(typesFile)) {
  const content = fs.readFileSync(typesFile, 'utf8');
  check(
    'RetryStrategy enum defined',
    content.includes('enum RetryStrategy'),
    'RetryStrategy enum not found'
  );
  check(
    'JitterType enum defined',
    content.includes('enum JitterType'),
    'JitterType enum not found'
  );
  check(
    'CircuitState enum defined',
    content.includes('enum CircuitState'),
    'CircuitState enum not found'
  );
  check(
    'DeadLetterMessage interface defined',
    content.includes('interface DeadLetterMessage'),
    'DeadLetterMessage interface not found'
  );
}

// Check 3: Retry Service implementation
const retryServiceFile = path.join(__dirname, 'src/services/RetryService.ts');
if (fs.existsSync(retryServiceFile)) {
  const content = fs.readFileSync(retryServiceFile, 'utf8');
  check(
    'executeWithRetry method exists',
    content.includes('async executeWithRetry'),
    'executeWithRetry method not found'
  );
  check(
    'Exponential backoff implemented',
    content.includes('RetryStrategy.EXPONENTIAL'),
    'Exponential backoff not found'
  );
  check(
    'Jitter application implemented',
    content.includes('applyJitter'),
    'Jitter application not found'
  );
  check(
    'Error classification implemented',
    content.includes('isRetryableError'),
    'Error classification not found'
  );
  check(
    'Timeout handling implemented',
    content.includes('executeWithTimeout'),
    'Timeout handling not found'
  );
}

// Check 4: Circuit Breaker implementation
const circuitBreakerFile = path.join(__dirname, 'src/services/CircuitBreakerService.ts');
if (fs.existsSync(circuitBreakerFile)) {
  const content = fs.readFileSync(circuitBreakerFile, 'utf8');
  check(
    'Circuit breaker execute method exists',
    content.includes('async execute'),
    'Execute method not found'
  );
  check(
    'Circuit states implemented',
    content.includes('CircuitState.CLOSED') && 
    content.includes('CircuitState.OPEN') && 
    content.includes('CircuitState.HALF_OPEN'),
    'Circuit states not found'
  );
  check(
    'Failure tracking implemented',
    content.includes('recordFailure'),
    'Failure tracking not found'
  );
  check(
    'Success tracking implemented',
    content.includes('recordSuccess'),
    'Success tracking not found'
  );
}

// Check 5: Dead Letter Queue implementation
const dlqFile = path.join(__dirname, 'src/services/DeadLetterQueueService.ts');
if (fs.existsSync(dlqFile)) {
  const content = fs.readFileSync(dlqFile, 'utf8');
  check(
    'addMessage method exists',
    content.includes('async addMessage'),
    'addMessage method not found'
  );
  check(
    'retryMessage method exists',
    content.includes('async retryMessage'),
    'retryMessage method not found'
  );
  check(
    'getStats method exists',
    content.includes('async getStats'),
    'getStats method not found'
  );
  check(
    'cleanup method exists',
    content.includes('cleanup'),
    'cleanup method not found'
  );
}

// Check 6: Enhanced RPC Service
const enhancedRPCFile = path.join(__dirname, 'src/services/EnhancedRPCService.ts');
if (fs.existsSync(enhancedRPCFile)) {
  const content = fs.readFileSync(enhancedRPCFile, 'utf8');
  check(
    'makeRPCCall method exists',
    content.includes('async makeRPCCall'),
    'makeRPCCall method not found'
  );
  check(
    'Uses retry service',
    content.includes('retryService'),
    'Retry service integration not found'
  );
  check(
    'Uses circuit breaker',
    content.includes('circuitBreakerService'),
    'Circuit breaker integration not found'
  );
}

// Check 7: Controller implementation
const controllerFile = path.join(__dirname, 'src/controllers/RetryController.ts');
if (fs.existsSync(controllerFile)) {
  const content = fs.readFileSync(controllerFile, 'utf8');
  check(
    'DLQ endpoints implemented',
    content.includes('getDLQStats') && content.includes('getDLQMessages'),
    'DLQ endpoints not found'
  );
  check(
    'Circuit breaker endpoints implemented',
    content.includes('getCircuitBreakerStats'),
    'Circuit breaker endpoints not found'
  );
  check(
    'RPC provider endpoints implemented',
    content.includes('getRPCProviderStats'),
    'RPC provider endpoints not found'
  );
}

// Check 8: Routes implementation
const routesFile = path.join(__dirname, 'src/routes/retry.ts');
if (fs.existsSync(routesFile)) {
  const content = fs.readFileSync(routesFile, 'utf8');
  check(
    'DLQ routes defined',
    content.includes('/dlq/'),
    'DLQ routes not found'
  );
  check(
    'Circuit breaker routes defined',
    content.includes('/circuit-breaker/'),
    'Circuit breaker routes not found'
  );
  check(
    'RPC routes defined',
    content.includes('/rpc/'),
    'RPC routes not found'
  );
}

// Check 9: Configuration presets
const configFile = path.join(__dirname, 'src/config/retryConfig.ts');
if (fs.existsSync(configFile)) {
  const content = fs.readFileSync(configFile, 'utf8');
  check(
    'RPC retry config defined',
    content.includes('RPC_RETRY_CONFIG'),
    'RPC retry config not found'
  );
  check(
    'Database retry config defined',
    content.includes('DATABASE_RETRY_CONFIG'),
    'Database retry config not found'
  );
  check(
    'Event indexer retry config defined',
    content.includes('EVENT_INDEXER_RETRY_CONFIG'),
    'Event indexer retry config not found'
  );
  check(
    'Circuit breaker config defined',
    content.includes('CIRCUIT_BREAKER_CONFIG'),
    'Circuit breaker config not found'
  );
  check(
    'Dead letter config defined',
    content.includes('DEAD_LETTER_CONFIG'),
    'Dead letter config not found'
  );
}

// Check 10: Tests
const testFile = path.join(__dirname, 'src/tests/retry.test.ts');
if (fs.existsSync(testFile)) {
  const content = fs.readFileSync(testFile, 'utf8');
  check(
    'Retry service tests exist',
    content.includes('describe') && content.includes('RetryService'),
    'Retry service tests not found'
  );
  check(
    'Circuit breaker tests exist',
    content.includes('CircuitBreakerService'),
    'Circuit breaker tests not found'
  );
  check(
    'Strategy tests exist',
    content.includes('Retry Strategies'),
    'Strategy tests not found'
  );
}

// Check 11: Documentation
console.log('\n📚 Checking documentation...');
const docFiles = [
  'RETRY_IMPLEMENTATION.md',
  'RETRY_QUICK_START.md',
  '../RETRY_IMPLEMENTATION_SUMMARY.md'
];

docFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  check(
    `Documentation: ${path.basename(file)}`,
    fs.existsSync(filePath),
    'Documentation file not found'
  );
});

// Check 12: Database migration
const migrationFile = path.join(__dirname, 'prisma/migrations/add_dead_letter_queue.sql');
if (fs.existsSync(migrationFile)) {
  const content = fs.readFileSync(migrationFile, 'utf8');
  check(
    'DLQ table creation',
    content.includes('CREATE TABLE') && content.includes('dead_letter_queue'),
    'DLQ table creation not found'
  );
  check(
    'DLQ indexes created',
    content.includes('CREATE INDEX'),
    'DLQ indexes not found'
  );
}

// Warnings
console.log('\n⚠️  Warnings and Recommendations...');
warn(
  'Database Migration',
  'Run migration to create dead_letter_queue table'
);
warn(
  'Authentication',
  'Ensure admin authorization is added to admin endpoints'
);
warn(
  'Monitoring',
  'Set up alerts for DLQ growth and circuit breaker state changes'
);
warn(
  'Testing',
  'Run tests with: npm test -- retry.test.ts'
);

// Summary
console.log('\n' + '='.repeat(50));
console.log('📊 Verification Summary');
console.log('='.repeat(50));
console.log(`✅ Passed: ${checks.passed}`);
console.log(`❌ Failed: ${checks.failed}`);
console.log(`⚠️  Warnings: ${checks.warnings}`);
console.log('='.repeat(50));

if (checks.failed === 0) {
  console.log('\n🎉 All checks passed! Implementation looks good.');
  console.log('\n📋 Next Steps:');
  console.log('1. Run: psql $DATABASE_URL < prisma/migrations/add_dead_letter_queue.sql');
  console.log('2. Test: npm test -- retry.test.ts');
  console.log('3. Start using: import { retryService } from "@/services/RetryService"');
  console.log('\n📖 Read: backend/RETRY_QUICK_START.md for usage guide');
  process.exit(0);
} else {
  console.log('\n❌ Some checks failed. Please review the errors above.');
  process.exit(1);
}
