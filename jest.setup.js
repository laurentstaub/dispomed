// Import Jest DOM extensions
import '@testing-library/jest-dom';

// Mock fetch globally with a more robust implementation
global.fetch = jest.fn().mockImplementation((url) => {
  // Config endpoint
  if (url && url.includes('config')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        dateReport: '2023-12-31'
      })
    });
  }
  
  // ATCClasses endpoint
  if (url && url.includes('ATCClasses')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([
        { atc_code: 'ATC1', atc_description: 'ATC Class 1', molecule_id: 'M1', molecule_name: 'Molecule 1' },
        { atc_code: 'ATC1', atc_description: 'ATC Class 1', molecule_id: 'M2', molecule_name: 'Molecule 2' },
        { atc_code: 'ATC2', atc_description: 'ATC Class 2', molecule_id: 'M3', molecule_name: 'Molecule 3' }
      ])
    });
  }
  
  // Default API response for incidents
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve([
      {
        product: 'Product 1',
        molecule_id: 'M1',
        molecule: 'Molecule 1',
        atc_code: 'ATC1',
        status: 'Rupture',
        start_date: '2023-01-01',
        end_date: null
      },
      {
        product: 'Product 2',
        molecule_id: 'M2',
        molecule: 'Molecule 2',
        atc_code: 'ATC1',
        status: 'Tension',
        start_date: '2023-02-01',
        end_date: '2023-03-01'
      }
    ])
  });
});

// Create a more comprehensive D3 mock
jest.mock('d3', () => {
  // Import actual d3 for functions we want to use directly
  const actual = jest.requireActual('d3');
  
  // Create timeFormat functions that return proper formatting functions
  const mockTimeFormat = jest.fn().mockImplementation(() => (date) => {
    return date instanceof Date ? date.toLocaleString() : 'invalid-date';
  });
  
  const mockTimeFormatLocale = jest.fn().mockImplementation(() => {
    return {
      format: mockTimeFormat,
      parse: jest.fn(str => new Date(str)),
      utcFormat: mockTimeFormat,
      utcParse: jest.fn(str => new Date(str))
    };
  });
  
  return {
    // Re-export actual methods that don't interact with DOM
    ...actual,
    
    // Mock visualization and DOM-interacting functions
    select: jest.fn().mockImplementation((selector) => {
      // Create a mock selection with common D3 methods
      const mockSelection = {
        select: jest.fn().mockReturnThis(),
        selectAll: jest.fn().mockReturnThis(),
        data: jest.fn().mockReturnThis(),
        enter: jest.fn().mockReturnThis(),
        exit: jest.fn().mockReturnThis(),
        append: jest.fn().mockReturnThis(),
        remove: jest.fn().mockReturnThis(),
        attr: jest.fn().mockReturnThis(),
        style: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        html: jest.fn().mockReturnThis(),
        on: jest.fn().mockReturnThis(),
        dispatch: jest.fn().mockReturnThis(),
        node: jest.fn().mockReturnValue({
          getBBox: () => ({ x: 0, y: 0, width: 100, height: 20 })
        }),
        property: jest.fn().mockReturnThis(),
        transition: jest.fn().mockReturnThis(),
        duration: jest.fn().mockReturnThis(),
        call: jest.fn().mockReturnThis(),
        empty: jest.fn().mockReturnValue(false),
      };
      return mockSelection;
    }),
    
    // Mock scale functions
    scaleLinear: jest.fn().mockImplementation(() => {
      return {
        domain: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        nice: jest.fn().mockReturnThis(),
        clamp: jest.fn().mockReturnThis(),
      };
    }),
    
    scaleTime: jest.fn().mockImplementation(() => {
      return {
        domain: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        nice: jest.fn().mockReturnThis(),
        ticks: jest.fn().mockReturnValue([]),
      };
    }),
    
    scaleBand: jest.fn().mockImplementation(() => {
      return {
        domain: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        padding: jest.fn().mockReturnThis(),
        bandwidth: jest.fn().mockReturnValue(20),
      };
    }),
    
    // Mock axis functions
    axisBottom: jest.fn().mockImplementation(() => jest.fn()),
    axisLeft: jest.fn().mockImplementation(() => jest.fn()),
    
    // Mock time functions
    timeFormat: mockTimeFormat,
    timeParse: jest.fn(str => new Date(str)),
    timeFormatLocale: mockTimeFormatLocale,
    timeMonth: {
      every: jest.fn().mockReturnValue(jest.fn()),
    },
    timeYear: {
      every: jest.fn().mockReturnValue(jest.fn()),
    },
    
    // Mock helpers
    max: jest.fn().mockReturnValue(100),
    min: jest.fn().mockReturnValue(0),
    
    // Mock line generator
    line: jest.fn().mockImplementation(() => {
      return {
        x: jest.fn().mockReturnThis(),
        y: jest.fn().mockReturnThis(),
        defined: jest.fn().mockReturnThis(),
      };
    }),
  };
});

// Create minimal DOM environment
if (typeof document === 'undefined') {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

// Add test DOM elements required for tests
beforeEach(() => {
  document.body.innerHTML = `
    <div id="molecule"></div>
    <div id="atc"></div>
    <div id="search-box"></div>
    <div id="dash"></div>
    <div id="summary"></div>
    <div id="tooltip"></div>
    <div id="floating-legend"></div>
    <button id="show-12-months"></button>
    <button id="show-24-months"></button>
    <button id="show-all-data"></button>
    <div id="reinitialiser"></div>
    <div id="vaccines-filter"></div>
  `;
}); 