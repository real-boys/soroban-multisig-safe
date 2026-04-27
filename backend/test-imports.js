#!/usr/bin/env node

/**
 * Test Import Structure and File Existence
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Testing File Structure and Imports\n');

const tests = [];

function checkFile(filePath, description) {
  const fullPath = path.join(__dirname, filePath);
  const exists = fs.existsSync(fullPath);
  tests.push({ description, passed: exists, file: filePath });
  return exists;
}

function checkImport(filePath, importStatement, description) {
  const fullPath = path.join(__dirname, filePath);
  if (!fs.existsSync(fullPath)) {
    tests.push({ description, passed: false, file: filePath, reason: 'File not found' });
    return false;
  }
  
  const content = fs.readFileSync(fullPath, 'utf8');
  const found = content.includes(importStatement);
  tests.push({ description, passed: found, file: filePath, reason: found ? null : 'Import not found' });
  return found;
}

function checkNoImport(filePath, importStatement, description) {
  const fullPath = path.join(__dirname, filePath);
  if (!fs.existsSync(fullPath)) {
    tests.push({ description, passed: false, file: filePath, reason: 'File not found' });
    return false;
  }
  
  const content = fs.readFileSync(fullPath, 'utf8');
  const found = !content.includes(importStatement);
  tests.push({ description, passed: found, file: filePath, reason: found ? null : 'Unwanted import found' });
  return found;
}

console.log('Test 1: Core Implementation Files');
checkFile('src/types/retry.ts', 'Type definitions exist');
checkFile('src/config/retryConfig.ts', 'Configuration presets exist');
checkFile('src/services/RetryService.ts', 'Retry service exists');
checkFile('src/services/CircuitBreakerService.ts', 'Circuit breaker service exists');
checkFile('src/services/DeadLetterQueueService.ts', 'DLQ service exists');
checkFile('src/services/EnhancedRPCService.ts', 'Enhanced RPC service exists');
checkFile('src/controllers/RetryController.ts', 'Retry controller exists');
checkFile('src/routes/retry.ts', 'Retry routes exist');

console.log('\nTest 2: Database and Tests');
checkFile('prisma/migrations/add_dead_letter_queue.sql', 'DLQ migration exists');
checkFile('src/tests/retry.test.ts', 'Retry tests exist');
checkFile('jest.config.js', 'Jest config exists');
checkFile('prisma/schema.prisma', 'Prisma schema exists');

console.log('\nTest 3: Documentation');
checkFile('RETRY_IMPLEMENTATION.md', 'Implementation guide exists');
checkFile('RETRY_QUICK_START.md', 'Quick start guide exists');

console.log('\nTest 4: Critical Fixes - Shared Prisma Instance');
checkImport('src/services/DeadLetterQueueService.ts', "import { prisma } from '@/config/database'", 'DLQ uses shared Prisma');
checkNoImport('src/services/DeadLetterQueueService.ts', 'const prisma = new PrismaClient()', 'DLQ does not create own Prisma');
checkImport('src/index.ts', "prisma } from '@/config/database'", 'Index uses shared Prisma');
checkNoImport('src/index.ts', 'const prisma = new PrismaClient()', 'Index does not create own Prisma');

console.log('\nTest 5: Integration Points');
checkImport('src/routes/v1/index.ts', "import retryRoutes from '@/routes/retry'", 'Retry routes imported in v1');
checkImport('src/routes/v1/index.ts', "router.use('/retry', retryRoutes)", 'Retry routes mounted in v1');
checkImport('src/index.ts', 'deadLetterQueueService', 'DLQ service imported in main');
checkImport('src/index.ts', 'deadLetterQueueService.start()', 'DLQ service started');
checkImport('src/index.ts', 'deadLetterQueueService.stop()', 'DLQ service stopped in shutdown');

console.log('\nTest 6: Retry Logic Implementation');
checkImport('src/services/RetryService.ts', 'RetryStrategy.EXPONENTIAL', 'Exponential strategy implemented');
checkImport('src/services/RetryService.ts', 'RetryStrategy.LINEAR', 'Linear strategy implemented');
checkImport('src/services/RetryService.ts', 'RetryStrategy.FIXED', 'Fixed strategy implemented');
checkImport('src/services/RetryService.ts', 'RetryStrategy.FIBONACCI', 'Fibonacci strategy implemented');
checkImport('src/services/RetryService.ts', 'JitterType.FULL', 'Full jitter implemented');
checkImport('src/services/RetryService.ts', 'JitterType.EQUAL', 'Equal jitter implemented');
checkImport('src/services/RetryService.ts', 'JitterType.DECORRELATED', 'Decorrelated jitter implemented');

console.log('\nTest 7: Circuit Breaker Implementation');
checkImport('src/services/CircuitBreakerService.ts', 'CircuitState.CLOSED', 'CLOSED state implemented');
checkImport('src/services/CircuitBreakerService.ts', 'CircuitState.OPEN', 'OPEN state implemented');
checkImport('src/services/CircuitBreakerService.ts', 'CircuitState.HALF_OPEN', 'HALF_OPEN state implemented');

console.log('\nTest 8: DLQ Implementation');
checkImport('src/services/DeadLetterQueueService.ts', 'async addMessage', 'DLQ addMessage method exists');
checkImport('src/services/DeadLetterQueueService.ts', 'async getMessage', 'DLQ getMessage method exists');
checkImport('src/services/DeadLetterQueueService.ts', 'async retryMessage', 'DLQ retryMessage method exists');
checkImport('src/services/DeadLetterQueueService.ts', 'async removeMessage', 'DLQ removeMessage method exists');
checkImport('src/services/DeadLetterQueueService.ts', 'async getStats', 'DLQ getStats method exists');

console.log('\nTest 9: Bug Fixes Verification');
checkImport('src/services/DeadLetterQueueService.ts', 'private isCleaningUp: boolean', 'Cleanup lock added');
checkImport('src/services/DeadLetterQueueService.ts', 'if (result.success)', 'Retry result checked properly');

console.log('\nTest 10: API Endpoints');
checkImport('src/routes/retry.ts', "router.get('/dlq/stats'", 'DLQ stats endpoint exists');
checkImport('src/routes/retry.ts', "router.get('/dlq/messages'", 'DLQ messages endpoint exists');
checkImport('src/routes/retry.ts', "router.get('/circuit-breaker/stats'", 'Circuit breaker stats endpoint exists');
checkImport('src/routes/retry.ts', "router.get('/rpc/providers'", 'RPC providers endpoint exists');

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 Test Summary\n');

const passed = tests.filter(t => t.passed).length;
const failed = tests.filter(t => !t.passed).length;
const total = tests.length;

const grouped = {};
tests.forEach(test => {
  const status = test.passed ? 'passed' : 'failed';
  if (!grouped[status]) grouped[status] = [];
  grouped[status].push(test);
});

if (grouped.passed) {
  console.log(`✅ Passed (${grouped.passed.length}):`);
  grouped.passed.forEach(t => {
    console.log(`   ✅ ${t.description}`);
  });
}

if (grouped.failed) {
  console.log(`\n❌ Failed (${grouped.failed.length}):`);
  grouped.failed.forEach(t => {
    console.log(`   ❌ ${t.description}`);
    console.log(`      File: ${t.file}`);
    if (t.reason) console.log(`      Reason: ${t.reason}`);
  });
}

console.log('\n' + '='.repeat(60));
console.log(`\n📈 Results: ${passed}/${total} tests passed (${((passed/total)*100).toFixed(1)}%)`);

if (failed > 0) {
  console.log(`\n❌ ${failed} test(s) failed\n`);
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!\n');
  process.exit(0);
}
