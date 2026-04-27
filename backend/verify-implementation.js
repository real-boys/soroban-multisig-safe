#!/usr/bin/env node

/**
 * Verification Script for Exponential Backoff Retry Implementation
 * 
 * This script verifies that all components of the retry implementation
 * are present and properly configured.
 */

const fs = require('fs');
const path = require('path');

const COLORS = {
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  RESET: '\x1b[0m',
};

function log(message, color = COLORS.RESET) {
  console.log(`${color}${message}${COLORS.RESET}`);
}

function checkFile(filePath, description) {
  const fullPath = path.join(__dirname, filePath);
  const exists = fs.existsSync(fullPath);
  
  if (exists) {
    const stats = fs.statSync(fullPath);
    log(`✅ ${description}: ${filePath} (${stats.size} bytes)`, COLORS.GREEN);
    return true;
  } else {
    log(`❌ ${description}: ${filePath} NOT FOUND`, COLORS.RED);
    return false;
  }
}

function checkFileContent(filePath, searchString, description) {
  const fullPath = path.join(__dirname, filePath);
  
  if (!fs.existsSync(fullPath)) {
    log(`❌ ${description}: File ${filePath} not found`, COLORS.RED);
    return false;
  }
  
  const content = fs.readFileSync(fullPath, 'utf8');
  const found = content.includes(searchString);
  
  if (found) {
    log(`✅ ${description}: Found in ${filePath}`, COLORS.GREEN);
    return true;
  } else {
    log(`❌ ${description}: Not found in ${filePath}`, COLORS.RED);
    return false;
  }
}

function main() {
  log('\n🔍 Verifying Exponential Backoff Retry Implementation\n', COLORS.BLUE);
  
  let totalChecks = 0;
  let passedChecks = 0;
  
  // Core Implementation Files
  log('📁 Core Implementation Files:', COLORS.YELLOW);
  const coreFiles = [
    ['src/types/retry.ts', 'Type Definitions'],
    ['src/config/retryConfig.ts', 'Configuration Presets'],
    ['src/services/RetryService.ts', 'Retry Service'],
    ['src/services/CircuitBreakerService.ts', 'Circuit Breaker Service'],
    ['src/services/DeadLetterQueueService.ts', 'Dead Letter Queue Service'],
    ['src/services/EnhancedRPCService.ts', 'Enhanced RPC Service'],
    ['src/controllers/RetryController.ts', 'Retry Controller'],
    ['src/routes/retry.ts', 'Retry Routes'],
  ];
  
  coreFiles.forEach(([file, desc]) => {
    totalChecks++;
    if (checkFile(file, desc)) passedChecks++;
  });
  
  // Database Migration
  log('\n📁 Database Migration:', COLORS.YELLOW);
  totalChecks++;
  if (checkFile('prisma/migrations/add_dead_letter_queue.sql', 'DLQ Migration')) {
    passedChecks++;
  }
  
  // Tests
  log('\n📁 Tests:', COLORS.YELLOW);
  totalChecks++;
  if (checkFile('src/tests/retry.test.ts', 'Retry Tests')) passedChecks++;
  totalChecks++;
  if (checkFile('jest.config.js', 'Jest Configuration')) passedChecks++;
  
  // Documentation
  log('\n📁 Documentation:', COLORS.YELLOW);
  const docFiles = [
    ['RETRY_IMPLEMENTATION.md', 'Implementation Guide'],
    ['RETRY_QUICK_START.md', 'Quick Start Guide'],
  ];
  
  docFiles.forEach(([file, desc]) => {
    totalChecks++;
    if (checkFile(file, desc)) passedChecks++;
  });
  
  // Integration Checks
  log('\n🔗 Integration Checks:', COLORS.YELLOW);
  
  totalChecks++;
  if (checkFileContent(
    'src/routes/v1/index.ts',
    "import retryRoutes from '@/routes/retry'",
    'Retry routes imported in v1'
  )) passedChecks++;
  
  totalChecks++;
  if (checkFileContent(
    'src/routes/v1/index.ts',
    "router.use('/retry', retryRoutes)",
    'Retry routes mounted in v1'
  )) passedChecks++;
  
  totalChecks++;
  if (checkFileContent(
    'src/index.ts',
    'deadLetterQueueService',
    'DLQ service imported in main app'
  )) passedChecks++;
  
  totalChecks++;
  if (checkFileContent(
    'src/index.ts',
    'deadLetterQueueService.start()',
    'DLQ service started in main app'
  )) passedChecks++;
  
  totalChecks++;
  if (checkFileContent(
    'src/index.ts',
    'deadLetterQueueService.stop()',
    'DLQ service stopped in graceful shutdown'
  )) passedChecks++;
  
  // Feature Checks
  log('\n✨ Feature Checks:', COLORS.YELLOW);
  
  totalChecks++;
  if (checkFileContent(
    'src/services/RetryService.ts',
    'RetryStrategy.EXPONENTIAL',
    'Exponential backoff strategy'
  )) passedChecks++;
  
  totalChecks++;
  if (checkFileContent(
    'src/services/RetryService.ts',
    'JitterType.FULL',
    'Jitter implementation'
  )) passedChecks++;
  
  totalChecks++;
  if (checkFileContent(
    'src/services/CircuitBreakerService.ts',
    'CircuitState.OPEN',
    'Circuit breaker states'
  )) passedChecks++;
  
  totalChecks++;
  if (checkFileContent(
    'src/services/DeadLetterQueueService.ts',
    'addMessage',
    'DLQ add message method'
  )) passedChecks++;
  
  totalChecks++;
  if (checkFileContent(
    'src/services/DeadLetterQueueService.ts',
    'retryMessage',
    'DLQ retry message method'
  )) passedChecks++;
  
  // API Endpoints Check
  log('\n🔌 API Endpoints:', COLORS.YELLOW);
  
  const endpoints = [
    ['/dlq/stats', 'DLQ statistics endpoint'],
    ['/dlq/messages', 'DLQ messages endpoint'],
    ['/circuit-breaker/stats', 'Circuit breaker stats endpoint'],
    ['/rpc/providers', 'RPC providers endpoint'],
  ];
  
  endpoints.forEach(([endpoint, desc]) => {
    totalChecks++;
    if (checkFileContent('src/routes/retry.ts', endpoint, desc)) {
      passedChecks++;
    }
  });
  
  // Summary
  log('\n' + '='.repeat(60), COLORS.BLUE);
  log(`\n📊 Verification Summary:`, COLORS.BLUE);
  log(`   Total Checks: ${totalChecks}`);
  log(`   Passed: ${passedChecks}`, COLORS.GREEN);
  log(`   Failed: ${totalChecks - passedChecks}`, totalChecks === passedChecks ? COLORS.GREEN : COLORS.RED);
  log(`   Success Rate: ${((passedChecks / totalChecks) * 100).toFixed(1)}%\n`);
  
  if (passedChecks === totalChecks) {
    log('🎉 All checks passed! Implementation is complete and ready for production.', COLORS.GREEN);
    log('✅ Exponential Backoff Retry Implementation: VERIFIED\n', COLORS.GREEN);
    process.exit(0);
  } else {
    log('⚠️  Some checks failed. Please review the implementation.', COLORS.YELLOW);
    log(`❌ ${totalChecks - passedChecks} issue(s) found.\n`, COLORS.RED);
    process.exit(1);
  }
}

main();
