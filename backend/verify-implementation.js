#!/usr/bin/env node

/**
 * Quick verification script for rate limiting implementation
 * Run with: node verify-implementation.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Rate Limiting Implementation...\n');

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
  'src/types/rateLimiting.ts',
  'src/config/rateLimitTiers.ts',
  'src/services/RateLimitService.ts',
  'src/controllers/rateLimitController.ts',
  'src/routes/rateLimit.ts',
  'src/middleware/rateLimiter.ts',
  'src/tests/rateLimiting.test.ts',
  'prisma/schema.prisma',
  'prisma/migrations/add_rate_limit_tier.sql'
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
const typesFile = path.join(__dirname, 'src/types/rateLimiting.ts');
if (fs.existsSync(typesFile)) {
  const content = fs.readFileSync(typesFile, 'utf8');
  check(
    'RateLimitTier enum defined',
    content.includes('enum RateLimitTier'),
    'RateLimitTier enum not found'
  );
  check(
    'All tiers defined',
    content.includes('FREE') && content.includes('BASIC') && 
    content.includes('PREMIUM') && content.includes('ENTERPRISE'),
    'Not all tiers defined'
  );
}

// Check 3: Service implementation
const serviceFile = path.join(__dirname, 'src/services/RateLimitService.ts');
if (fs.existsSync(serviceFile)) {
  const content = fs.readFileSync(serviceFile, 'utf8');
  check(
    'checkRateLimit method exists',
    content.includes('async checkRateLimit'),
    'checkRateLimit method not found'
  );
  check(
    'getUserTier method exists',
    content.includes('async getUserTier'),
    'getUserTier method not found'
  );
  check(
    'Burst capacity check',
    content.includes('burstCount') && content.includes('burstCapacity'),
    'Burst capacity logic not found'
  );
  check(
    'Graceful degradation',
    content.includes('checkDegradation') && content.includes('DEGRADATION_THRESHOLDS'),
    'Graceful degradation not implemented'
  );
  check(
    'Violation tracking',
    content.includes('recordViolation') && content.includes('temporarilyBan'),
    'Violation tracking not implemented'
  );
  check(
    'Fail open strategy',
    content.includes('Fail open') && content.includes('allowed: true'),
    'Fail open strategy not implemented'
  );
}

// Check 4: Middleware implementation
const middlewareFile = path.join(__dirname, 'src/middleware/rateLimiter.ts');
if (fs.existsSync(middlewareFile)) {
  const content = fs.readFileSync(middlewareFile, 'utf8');
  check(
    'userRateLimiter middleware exists',
    content.includes('export const userRateLimiter'),
    'userRateLimiter not exported'
  );
  check(
    'strictRateLimiter middleware exists',
    content.includes('export const strictRateLimiter'),
    'strictRateLimiter not exported'
  );
  check(
    'Response headers set',
    content.includes('X-RateLimit-Tier') && content.includes('X-RateLimit-Remaining'),
    'Response headers not set'
  );
  check(
    '429 status code',
    content.includes('429') && content.includes('RATE_LIMIT_EXCEEDED'),
    '429 response not implemented'
  );
}

// Check 5: Routes implementation
const routesFile = path.join(__dirname, 'src/routes/rateLimit.ts');
if (fs.existsSync(routesFile)) {
  const content = fs.readFileSync(routesFile, 'utf8');
  check(
    'Status endpoint',
    content.includes('/status'),
    'Status endpoint not found'
  );
  check(
    'Tiers endpoint',
    content.includes('/tiers'),
    'Tiers endpoint not found'
  );
  check(
    'Admin endpoints',
    content.includes('/admin'),
    'Admin endpoints not found'
  );
}

// Check 6: Database schema
const schemaFile = path.join(__dirname, 'prisma/schema.prisma');
if (fs.existsSync(schemaFile)) {
  const content = fs.readFileSync(schemaFile, 'utf8');
  check(
    'rateLimitTier field added',
    content.includes('rateLimitTier'),
    'rateLimitTier field not found in schema'
  );
  check(
    'Default tier set',
    content.includes('default("FREE")'),
    'Default tier not set'
  );
}

// Check 7: Configuration
const configFile = path.join(__dirname, 'src/config/rateLimitTiers.ts');
if (fs.existsSync(configFile)) {
  const content = fs.readFileSync(configFile, 'utf8');
  check(
    'Tier configurations defined',
    content.includes('RATE_LIMIT_TIERS'),
    'RATE_LIMIT_TIERS not found'
  );
  check(
    'Degradation thresholds defined',
    content.includes('DEGRADATION_THRESHOLDS'),
    'DEGRADATION_THRESHOLDS not found'
  );
  check(
    'Violation config defined',
    content.includes('VIOLATION_CONFIG'),
    'VIOLATION_CONFIG not found'
  );
  check(
    'Redis keys defined',
    content.includes('REDIS_KEYS'),
    'REDIS_KEYS not found'
  );
}

// Check 8: Tests
const testFile = path.join(__dirname, 'src/tests/rateLimiting.test.ts');
if (fs.existsSync(testFile)) {
  const content = fs.readFileSync(testFile, 'utf8');
  check(
    'Test suite exists',
    content.includes('describe') && content.includes('RateLimitService'),
    'Test suite not found'
  );
  check(
    'Tests for checkRateLimit',
    content.includes('checkRateLimit'),
    'checkRateLimit tests not found'
  );
  check(
    'Tests for getUserTier',
    content.includes('getUserTier'),
    'getUserTier tests not found'
  );
}

// Check 9: Documentation
console.log('\n📚 Checking documentation...');
const docFiles = [
  '../RATE_LIMITING_IMPLEMENTATION_SUMMARY.md',
  'RATE_LIMITING.md',
  'RATE_LIMITING_EXAMPLES.md',
  'RATE_LIMITING_QUICK_START.md',
  'RATE_LIMITING_ARCHITECTURE.md'
];

docFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  check(
    `Documentation: ${path.basename(file)}`,
    fs.existsSync(filePath),
    'Documentation file not found'
  );
});

// Warnings
console.log('\n⚠️  Warnings and Recommendations...');
warn(
  'Redis Connection',
  'Ensure Redis is running before starting the server'
);
warn(
  'Database Migration',
  'Run "npm run db:migrate" to add rateLimitTier field'
);
warn(
  'Admin Authorization',
  'Add admin authorization middleware to admin endpoints in production'
);
warn(
  'Environment Variables',
  'Configure REDIS_URL in production environment'
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
  console.log('1. Run: npm run db:migrate');
  console.log('2. Ensure Redis is running: redis-cli ping');
  console.log('3. Start server: npm run dev');
  console.log('4. Test: curl http://localhost:5001/api/v1/rate-limit/tiers');
  console.log('\n📖 Read: backend/RATE_LIMITING_QUICK_START.md for setup guide');
  process.exit(0);
} else {
  console.log('\n❌ Some checks failed. Please review the errors above.');
  process.exit(1);
}
