/**
 * Performance tests for Dispomed application
 * Run with: npm test -- performance.test.js
 */

import { performance } from 'perf_hooks';

// Helper to measure execution time
function measureTime(fn, label) {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  const duration = end - start;
  console.log(`${label}: ${duration.toFixed(2)}ms`);
  return { result, duration };
}

// Helper to measure async execution time
async function measureTimeAsync(fn, label) {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  const duration = end - start;
  console.log(`${label}: ${duration.toFixed(2)}ms`);
  return { result, duration };
}

describe('Performance Tests', () => {
  describe('Database Performance', () => {
    let dbQuery;
    
    beforeAll(async () => {
      // Import database module
      const dbModule = await import('../database/connect_db.js');
      dbQuery = dbModule.dbQuery;
    });
    
    test('Connection pool performance - concurrent queries', async () => {
      const numQueries = 20;
      const query = 'SELECT 1 as test';
      
      // Measure time for concurrent queries (should use pool)
      const { duration: poolDuration } = await measureTimeAsync(async () => {
        const promises = Array(numQueries).fill(null).map(() => 
          dbQuery(query)
        );
        return Promise.all(promises);
      }, `${numQueries} concurrent queries with pool`);
      
      // Performance assertion: should complete within reasonable time
      // With pooling, 20 queries should complete in under 500ms
      expect(poolDuration).toBeLessThan(500);
      
      // Calculate average query time
      const avgQueryTime = poolDuration / numQueries;
      console.log(`Average query time: ${avgQueryTime.toFixed(2)}ms`);
      expect(avgQueryTime).toBeLessThan(50);
    });
    
    test('Query performance - incidents fetch', async () => {
      const query = `
        SELECT COUNT(*) as count 
        FROM incidents 
        WHERE calculated_end_date >= CURRENT_DATE - INTERVAL '12 months'
      `;
      
      const { duration } = await measureTimeAsync(async () => {
        return dbQuery(query);
      }, 'Count incidents query');
      
      // Should complete within 100ms for a count query
      expect(duration).toBeLessThan(100);
    });
  });
  
  describe('Data Processing Performance', () => {
    let dataManager;
    
    beforeAll(async () => {
      const module = await import('../public/js/01_store_data.js');
      dataManager = module.dataManager;
    });
    
    test('Monthly chart data processing performance', () => {
      // Mock data
      const mockData = generateMockIncidents(1000);
      const startDate = new Date('2023-01-01');
      const endDate = new Date('2024-01-01');
      
      dataManager.setStartDate(startDate);
      dataManager.setEndDate(endDate);
      
      // First call - no cache
      const { duration: firstCallDuration } = measureTime(() => {
        return dataManager.processDataMonthlyChart(mockData);
      }, 'First monthly chart processing (no cache)');
      
      // Second call - should use cache
      const { duration: secondCallDuration } = measureTime(() => {
        return dataManager.processDataMonthlyChart(mockData);
      }, 'Second monthly chart processing (with cache)');
      
      // Cache should make second call much faster
      expect(secondCallDuration).toBeLessThan(firstCallDuration * 0.1);
      expect(secondCallDuration).toBeLessThan(5); // Should be near instant
    });
    
    test('Product deduplication performance', () => {
      const mockData = generateMockIncidents(5000);
      
      const { duration } = measureTime(() => {
        dataManager.setProducts(mockData);
        return dataManager.getProducts();
      }, 'Product deduplication for 5000 items');
      
      // Should complete within 50ms
      expect(duration).toBeLessThan(50);
    });
  });
  
  describe('Frontend Rendering Performance', () => {
    test('DOM manipulation performance simulation', () => {
      // Simulate creating many DOM elements
      const numElements = 500;
      
      const { duration } = measureTime(() => {
        const container = document.createElement('div');
        for (let i = 0; i < numElements; i++) {
          const row = document.createElement('div');
          row.className = 'maintbl-row-modern';
          row.innerHTML = `
            <span>Status ${i}</span>
            <a href="#">Product ${i}</a>
            <svg width="100" height="20"></svg>
          `;
          container.appendChild(row);
        }
        return container;
      }, `Creating ${numElements} table rows`);
      
      // Should complete within 100ms
      expect(duration).toBeLessThan(100);
    });
  });
  
  describe('API Response Time', () => {
    test('API endpoint response times', async () => {
      const endpoints = [
        { url: '/api/incidents?monthsToShow=12', name: 'Incidents (12 months)' },
        { url: '/api/config', name: 'Config' },
      ];
      
      for (const endpoint of endpoints) {
        const { duration } = await measureTimeAsync(async () => {
          const response = await fetch(`http://localhost:3000${endpoint.url}`);
          return response.json();
        }, `API ${endpoint.name}`);
        
        // API responses should be under 200ms
        expect(duration).toBeLessThan(200);
      }
    });
  });
  
  describe('Memory Usage', () => {
    test('Memory usage for large datasets', () => {
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const initialMemory = process.memoryUsage().heapUsed;
        
        // Create large dataset
        const largeData = generateMockIncidents(10000);
        
        const memoryAfterData = process.memoryUsage().heapUsed;
        const memoryUsed = (memoryAfterData - initialMemory) / 1024 / 1024; // Convert to MB
        
        console.log(`Memory used for 10000 incidents: ${memoryUsed.toFixed(2)} MB`);
        
        // Should use less than 50MB for 10000 incidents
        expect(memoryUsed).toBeLessThan(50);
        
        // Clean up
        largeData.length = 0;
      }
    });
  });
});

// Helper function to generate mock incident data
function generateMockIncidents(count) {
  const statuses = ['Rupture', 'Tension', 'Disponible', 'Arret'];
  const incidents = [];
  
  for (let i = 0; i < count; i++) {
    const startDate = new Date(2023, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + Math.floor(Math.random() * 180));
    
    incidents.push({
      product: `Product_${i}`,
      accented_product: `Product_${i}`,
      product_id: i,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      start_date: startDate,
      end_date: endDate,
      calculated_end_date: endDate,
      cis_codes: Array(Math.floor(Math.random() * 5) + 1).fill(null).map((_, j) => `CIS${i}_${j}`),
      molecule: `Molecule_${Math.floor(i / 10)}`,
      atc_code: `A0${Math.floor(i / 100)}`,
    });
  }
  
  return incidents;
}

// Performance benchmarks configuration
export const performanceBenchmarks = {
  database: {
    connectionPool: { maxDuration: 500, target: 200 },
    querySimple: { maxDuration: 50, target: 20 },
    queryComplex: { maxDuration: 200, target: 100 },
  },
  api: {
    incidents: { maxDuration: 200, target: 100 },
    config: { maxDuration: 50, target: 20 },
    search: { maxDuration: 150, target: 75 },
  },
  frontend: {
    chartRender: { maxDuration: 100, target: 50 },
    tableRender: { maxDuration: 150, target: 75 },
    dataProcessing: { maxDuration: 50, target: 25 },
  },
  memory: {
    smallDataset: { maxMB: 10, target: 5 },
    mediumDataset: { maxMB: 25, target: 15 },
    largeDataset: { maxMB: 50, target: 30 },
  },
};