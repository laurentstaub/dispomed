#!/usr/bin/env node

/**
 * Performance monitoring script for Dispomed application
 * Run with: node scripts/performance_monitor.js
 */

import fetch from 'node-fetch';
import { performance } from 'perf_hooks';
import chalk from 'chalk';

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

// Performance thresholds (in milliseconds)
const THRESHOLDS = {
  excellent: 50,
  good: 100,
  acceptable: 200,
  poor: 500,
};

// Format duration with color based on performance
function formatDuration(duration) {
  if (duration < THRESHOLDS.excellent) {
    return chalk.green(`${duration.toFixed(2)}ms ✓`);
  } else if (duration < THRESHOLDS.good) {
    return chalk.green(`${duration.toFixed(2)}ms`);
  } else if (duration < THRESHOLDS.acceptable) {
    return chalk.yellow(`${duration.toFixed(2)}ms`);
  } else if (duration < THRESHOLDS.poor) {
    return chalk.red(`${duration.toFixed(2)}ms ⚠`);
  } else {
    return chalk.red.bold(`${duration.toFixed(2)}ms ✗`);
  }
}

// Measure endpoint performance
async function measureEndpoint(endpoint, description) {
  const url = `${BASE_URL}${endpoint}`;
  const start = performance.now();
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    const end = performance.now();
    const duration = end - start;
    
    console.log(`${description}: ${formatDuration(duration)}`);
    
    return {
      endpoint,
      description,
      duration,
      success: true,
      dataSize: JSON.stringify(data).length,
      recordCount: Array.isArray(data) ? data.length : null,
    };
  } catch (error) {
    const end = performance.now();
    const duration = end - start;
    
    console.log(`${description}: ${chalk.red('FAILED')} (${duration.toFixed(2)}ms)`);
    console.error(`  Error: ${error.message}`);
    
    return {
      endpoint,
      description,
      duration,
      success: false,
      error: error.message,
    };
  }
}

// Run load test
async function loadTest(endpoint, concurrency = 10, iterations = 3) {
  console.log(chalk.blue(`\nLoad Testing ${endpoint} (${concurrency} concurrent, ${iterations} iterations)`));
  
  const results = [];
  
  for (let i = 0; i < iterations; i++) {
    const iterationStart = performance.now();
    
    const promises = Array(concurrency).fill(null).map(() => 
      fetch(`${BASE_URL}${endpoint}`)
    );
    
    await Promise.all(promises);
    
    const iterationEnd = performance.now();
    const duration = iterationEnd - iterationStart;
    results.push(duration);
    
    console.log(`  Iteration ${i + 1}: ${formatDuration(duration)} (${(duration / concurrency).toFixed(2)}ms per request)`);
  }
  
  const avg = results.reduce((a, b) => a + b, 0) / results.length;
  const min = Math.min(...results);
  const max = Math.max(...results);
  
  console.log(chalk.cyan(`  Summary: Avg ${formatDuration(avg)}, Min ${formatDuration(min)}, Max ${formatDuration(max)}`));
  
  return { avg, min, max, results };
}

// Database performance test
async function testDatabasePerformance() {
  console.log(chalk.blue('\n=== Database Performance ==='));
  
  const queries = [
    { endpoint: '/api/incidents?monthsToShow=1', description: 'Incidents (1 month)' },
    { endpoint: '/api/incidents?monthsToShow=12', description: 'Incidents (12 months)' },
    { endpoint: '/api/incidents?monthsToShow=60', description: 'Incidents (all time)' },
    { endpoint: '/api/incidents?product=doliprane', description: 'Search query' },
  ];
  
  const results = [];
  for (const query of queries) {
    const result = await measureEndpoint(query.endpoint, query.description);
    results.push(result);
    
    if (result.recordCount !== null) {
      console.log(`  Records: ${result.recordCount}, Data size: ${(result.dataSize / 1024).toFixed(2)}KB`);
    }
  }
  
  return results;
}

// API performance test
async function testAPIPerformance() {
  console.log(chalk.blue('\n=== API Performance ==='));
  
  const endpoints = [
    { endpoint: '/api/config', description: 'Config endpoint' },
    { endpoint: '/api/search?searchTerm=para&monthsToShow=12', description: 'Search suggestions' },
  ];
  
  const results = [];
  for (const ep of endpoints) {
    const result = await measureEndpoint(ep.endpoint, ep.description);
    results.push(result);
  }
  
  return results;
}

// Page load performance test
async function testPageLoadPerformance() {
  console.log(chalk.blue('\n=== Page Load Performance ==='));
  
  const pages = [
    { endpoint: '/', description: 'Main page' },
  ];
  
  const results = [];
  for (const page of pages) {
    const url = `${BASE_URL}${page.endpoint}`;
    const start = performance.now();
    
    try {
      const response = await fetch(url);
      const html = await response.text();
      const end = performance.now();
      const duration = end - start;
      
      console.log(`${page.description}: ${formatDuration(duration)}`);
      console.log(`  Size: ${(html.length / 1024).toFixed(2)}KB`);
      
      results.push({
        ...page,
        duration,
        success: true,
        size: html.length,
      });
    } catch (error) {
      console.log(`${page.description}: ${chalk.red('FAILED')}`);
      results.push({
        ...page,
        success: false,
        error: error.message,
      });
    }
  }
  
  return results;
}

// Generate performance report
function generateReport(results) {
  console.log(chalk.blue('\n=== Performance Report ==='));
  
  const allResults = results.flat();
  const successfulResults = allResults.filter(r => r.success && r.duration);
  
  if (successfulResults.length === 0) {
    console.log(chalk.red('No successful measurements to report'));
    return;
  }
  
  const durations = successfulResults.map(r => r.duration);
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  const p95 = durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)];
  
  console.log(`\nOverall Statistics:`);
  console.log(`  Average: ${formatDuration(avg)}`);
  console.log(`  Minimum: ${formatDuration(min)}`);
  console.log(`  Maximum: ${formatDuration(max)}`);
  console.log(`  P95: ${formatDuration(p95)}`);
  
  // Identify slow endpoints
  const slowEndpoints = successfulResults
    .filter(r => r.duration > THRESHOLDS.acceptable)
    .sort((a, b) => b.duration - a.duration);
  
  if (slowEndpoints.length > 0) {
    console.log(chalk.yellow('\nSlow Endpoints (>200ms):'));
    slowEndpoints.forEach(ep => {
      console.log(`  ${ep.description}: ${formatDuration(ep.duration)}`);
    });
  }
  
  // Performance grade
  let grade;
  if (avg < THRESHOLDS.excellent) grade = 'A+';
  else if (avg < THRESHOLDS.good) grade = 'A';
  else if (avg < THRESHOLDS.acceptable) grade = 'B';
  else if (avg < THRESHOLDS.poor) grade = 'C';
  else grade = 'D';
  
  console.log(chalk.bold(`\nPerformance Grade: ${grade}`));
}

// Main execution
async function main() {
  console.log(chalk.bold.cyan('Dispomed Performance Monitor'));
  console.log(chalk.gray(`Testing ${BASE_URL}`));
  console.log(chalk.gray(new Date().toISOString()));
  
  try {
    // Check if server is running
    console.log(chalk.blue('\n=== Server Status ==='));
    const response = await fetch(`${BASE_URL}/api/config`);
    if (response.ok) {
      console.log(chalk.green('✓ Server is running'));
    } else {
      throw new Error('Server returned non-OK status');
    }
  } catch (error) {
    console.log(chalk.red('✗ Server is not responding'));
    console.error(`Error: ${error.message}`);
    console.log(chalk.yellow('\nPlease start the server with: npm start'));
    process.exit(1);
  }
  
  const results = [];
  
  // Run tests
  results.push(await testDatabasePerformance());
  results.push(await testAPIPerformance());
  results.push(await testPageLoadPerformance());
  
  // Load tests
  console.log(chalk.blue('\n=== Load Tests ==='));
  await loadTest('/api/config', 20, 3);
  await loadTest('/api/incidents?monthsToShow=12', 10, 3);
  
  // Generate report
  generateReport(results);
  
  console.log(chalk.gray('\n' + new Date().toISOString()));
}

// Run the monitor
main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});