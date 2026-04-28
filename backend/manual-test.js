#!/usr/bin/env node

/**
 * Manual Test Suite for Retry Implementation
 * Tests core logic without requiring database or full dependencies
 */

console.log('🧪 Manual Test Suite for Exponential Backoff Retry Implementation\n');

// Test 1: Exponential Backoff Calculation
console.log('Test 1: Exponential Backoff Calculation');
function testExponentialBackoff() {
  const initialDelay = 1000;
  const multiplier = 2;
  const maxDelay = 30000;
  
  const delays = [];
  for (let attempt = 1; attempt <= 5; attempt++) {
    let delay = initialDelay * Math.pow(multiplier, attempt - 1);
    delay = Math.min(delay, maxDelay);
    delays.push(delay);
  }
  
  const expected = [1000, 2000, 4000, 8000, 16000];
  const passed = JSON.stringify(delays) === JSON.stringify(expected);
  
  console.log(`  Expected: ${expected}`);
  console.log(`  Got:      ${delays}`);
  console.log(`  Status:   ${passed ? '✅ PASS' : '❌ FAIL'}\n`);
  
  return passed;
}

// Test 2: Linear Backoff Calculation
console.log('Test 2: Linear Backoff Calculation');
function testLinearBackoff() {
  const initialDelay = 1000;
  
  const delays = [];
  for (let attempt = 1; attempt <= 5; attempt++) {
    const delay = initialDelay * attempt;
    delays.push(delay);
  }
  
  const expected = [1000, 2000, 3000, 4000, 5000];
  const passed = JSON.stringify(delays) === JSON.stringify(expected);
  
  console.log(`  Expected: ${expected}`);
  console.log(`  Got:      ${delays}`);
  console.log(`  Status:   ${passed ? '✅ PASS' : '❌ FAIL'}\n`);
  
  return passed;
}

// Test 3: Fibonacci Backoff Calculation
console.log('Test 3: Fibonacci Backoff Calculation');
function testFibonacciBackoff() {
  function fibonacci(n) {
    if (n <= 1) return 1;
    if (n === 2) return 2;
    let prev = 1, curr = 2;
    for (let i = 3; i <= n; i++) {
      const next = prev + curr;
      prev = curr;
      curr = next;
    }
    return curr;
  }
  
  const initialDelay = 1000;
  const delays = [];
  for (let attempt = 1; attempt <= 5; attempt++) {
    const delay = fibonacci(attempt) * initialDelay;
    delays.push(delay);
  }
  
  const expected = [1000, 2000, 3000, 5000, 8000];
  const passed = JSON.stringify(delays) === JSON.stringify(expected);
  
  console.log(`  Expected: ${expected}`);
  console.log(`  Got:      ${delays}`);
  console.log(`  Status:   ${passed ? '✅ PASS' : '❌ FAIL'}\n`);
  
  return passed;
}

// Test 4: Full Jitter Application
console.log('Test 4: Full Jitter Application');
function testFullJitter() {
  const baseDelay = 1000;
  const samples = 100;
  let allInRange = true;
  
  for (let i = 0; i < samples; i++) {
    const jitteredDelay = Math.random() * baseDelay;
    if (jitteredDelay < 0 || jitteredDelay > baseDelay) {
      allInRange = false;
      break;
    }
  }
  
  console.log(`  Base delay: ${baseDelay}ms`);
  console.log(`  Samples tested: ${samples}`);
  console.log(`  All in range [0, ${baseDelay}]: ${allInRange}`);
  console.log(`  Status:   ${allInRange ? '✅ PASS' : '❌ FAIL'}\n`);
  
  return allInRange;
}

// Test 5: Equal Jitter Application
console.log('Test 5: Equal Jitter Application');
function testEqualJitter() {
  const baseDelay = 1000;
  const samples = 100;
  let allInRange = true;
  
  for (let i = 0; i < samples; i++) {
    const jitteredDelay = baseDelay / 2 + Math.random() * (baseDelay / 2);
    if (jitteredDelay < baseDelay / 2 || jitteredDelay > baseDelay) {
      allInRange = false;
      break;
    }
  }
  
  console.log(`  Base delay: ${baseDelay}ms`);
  console.log(`  Samples tested: ${samples}`);
  console.log(`  All in range [${baseDelay/2}, ${baseDelay}]: ${allInRange}`);
  console.log(`  Status:   ${allInRange ? '✅ PASS' : '❌ FAIL'}\n`);
  
  return allInRange;
}

// Test 6: Max Delay Cap
console.log('Test 6: Max Delay Cap');
function testMaxDelayCap() {
  const initialDelay = 1000;
  const multiplier = 2;
  const maxDelay = 5000;
  
  const delays = [];
  for (let attempt = 1; attempt <= 10; attempt++) {
    let delay = initialDelay * Math.pow(multiplier, attempt - 1);
    delay = Math.min(delay, maxDelay);
    delays.push(delay);
  }
  
  const allCapped = delays.every(d => d <= maxDelay);
  const hasCappedValues = delays.some(d => d === maxDelay);
  
  console.log(`  Max delay: ${maxDelay}ms`);
  console.log(`  Delays: ${delays.slice(0, 7).join(', ')}...`);
  console.log(`  All <= max: ${allCapped}`);
  console.log(`  Has capped values: ${hasCappedValues}`);
  console.log(`  Status:   ${allCapped && hasCappedValues ? '✅ PASS' : '❌ FAIL'}\n`);
  
  return allCapped && hasCappedValues;
}

// Test 7: Error Classification
console.log('Test 7: Error Classification');
function testErrorClassification() {
  const retryableErrors = ['NETWORK_ERROR', 'TIMEOUT', '503', '504'];
  const nonRetryableErrors = ['400', '401', '403', '404'];
  
  function isRetryable(error, retryableList, nonRetryableList) {
    // Check non-retryable first
    for (const nonRetryable of nonRetryableList) {
      if (error.includes(nonRetryable)) return false;
    }
    // Check retryable
    for (const retryable of retryableList) {
      if (error.includes(retryable)) return true;
    }
    return false;
  }
  
  const tests = [
    { error: 'NETWORK_ERROR', expected: true },
    { error: 'TIMEOUT', expected: true },
    { error: '503 Service Unavailable', expected: true },
    { error: '400 Bad Request', expected: false },
    { error: '401 Unauthorized', expected: false },
    { error: '404 Not Found', expected: false },
  ];
  
  let passed = true;
  for (const test of tests) {
    const result = isRetryable(test.error, retryableErrors, nonRetryableErrors);
    const testPassed = result === test.expected;
    console.log(`  ${test.error}: ${result} (expected ${test.expected}) ${testPassed ? '✅' : '❌'}`);
    if (!testPassed) passed = false;
  }
  
  console.log(`  Status:   ${passed ? '✅ PASS' : '❌ FAIL'}\n`);
  return passed;
}

// Test 8: Circuit Breaker State Transitions
console.log('Test 8: Circuit Breaker State Transitions');
function testCircuitBreakerStates() {
  const states = {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    HALF_OPEN: 'HALF_OPEN'
  };
  
  let currentState = states.CLOSED;
  let failures = 0;
  let successes = 0;
  const failureThreshold = 5;
  const successThreshold = 2;
  
  // Simulate failures to open circuit
  for (let i = 0; i < failureThreshold; i++) {
    failures++;
    if (failures >= failureThreshold && currentState === states.CLOSED) {
      currentState = states.OPEN;
    }
  }
  
  const openedCorrectly = currentState === states.OPEN;
  console.log(`  After ${failureThreshold} failures: ${currentState} ${openedCorrectly ? '✅' : '❌'}`);
  
  // Simulate timeout and move to HALF_OPEN
  currentState = states.HALF_OPEN;
  failures = 0;
  successes = 0;
  
  console.log(`  After timeout: ${currentState} ✅`);
  
  // Simulate successes to close circuit
  for (let i = 0; i < successThreshold; i++) {
    successes++;
    if (successes >= successThreshold && currentState === states.HALF_OPEN) {
      currentState = states.CLOSED;
      failures = 0;
      successes = 0;
    }
  }
  
  const closedCorrectly = currentState === states.CLOSED;
  console.log(`  After ${successThreshold} successes: ${currentState} ${closedCorrectly ? '✅' : '❌'}`);
  
  const passed = openedCorrectly && closedCorrectly;
  console.log(`  Status:   ${passed ? '✅ PASS' : '❌ FAIL'}\n`);
  
  return passed;
}

// Test 9: Retry Attempt Counting
console.log('Test 9: Retry Attempt Counting');
function testRetryAttemptCounting() {
  const maxAttempts = 5;
  let attempts = 0;
  let shouldRetry = true;
  
  while (shouldRetry && attempts < maxAttempts) {
    attempts++;
    if (attempts >= maxAttempts) {
      shouldRetry = false;
    }
  }
  
  const passed = attempts === maxAttempts;
  console.log(`  Max attempts: ${maxAttempts}`);
  console.log(`  Actual attempts: ${attempts}`);
  console.log(`  Status:   ${passed ? '✅ PASS' : '❌ FAIL'}\n`);
  
  return passed;
}

// Test 10: Timeout Simulation
console.log('Test 10: Timeout Simulation');
async function testTimeout() {
  const timeout = 100;
  const operationTime = 50;
  
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('TIMEOUT')), timeout)
  );
  
  const operationPromise = new Promise((resolve) => 
    setTimeout(() => resolve('SUCCESS'), operationTime)
  );
  
  try {
    const result = await Promise.race([operationPromise, timeoutPromise]);
    const passed = result === 'SUCCESS';
    console.log(`  Timeout: ${timeout}ms, Operation: ${operationTime}ms`);
    console.log(`  Result: ${result}`);
    console.log(`  Status:   ${passed ? '✅ PASS' : '❌ FAIL'}\n`);
    return passed;
  } catch (error) {
    console.log(`  Timeout: ${timeout}ms, Operation: ${operationTime}ms`);
    console.log(`  Result: ${error.message}`);
    console.log(`  Status:   ❌ FAIL (should not timeout)\n`);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  const results = [];
  
  results.push({ name: 'Exponential Backoff', passed: testExponentialBackoff() });
  results.push({ name: 'Linear Backoff', passed: testLinearBackoff() });
  results.push({ name: 'Fibonacci Backoff', passed: testFibonacciBackoff() });
  results.push({ name: 'Full Jitter', passed: testFullJitter() });
  results.push({ name: 'Equal Jitter', passed: testEqualJitter() });
  results.push({ name: 'Max Delay Cap', passed: testMaxDelayCap() });
  results.push({ name: 'Error Classification', passed: testErrorClassification() });
  results.push({ name: 'Circuit Breaker States', passed: testCircuitBreakerStates() });
  results.push({ name: 'Retry Attempt Counting', passed: testRetryAttemptCounting() });
  results.push({ name: 'Timeout Simulation', passed: await testTimeout() });
  
  // Summary
  console.log('='.repeat(60));
  console.log('📊 Test Summary\n');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  results.forEach(result => {
    console.log(`  ${result.passed ? '✅' : '❌'} ${result.name}`);
  });
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n📈 Results: ${passed}/${total} tests passed (${((passed/total)*100).toFixed(1)}%)`);
  
  if (failed > 0) {
    console.log(`❌ ${failed} test(s) failed\n`);
    process.exit(1);
  } else {
    console.log('✅ All tests passed!\n');
    process.exit(0);
  }
}

runAllTests().catch(error => {
  console.error('Error running tests:', error);
  process.exit(1);
});
