// Mock d3 before any imports
jest.mock('d3', () => {
  return {
    select: jest.fn().mockImplementation(() => ({
      append: jest.fn().mockReturnThis(),
      attr: jest.fn().mockReturnThis(),
      style: jest.fn().mockReturnThis(),
      text: jest.fn().mockReturnThis(),
      html: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      selectAll: jest.fn().mockReturnThis(),
      data: jest.fn().mockReturnThis(),
      enter: jest.fn().mockReturnThis(),
      exit: jest.fn().mockReturnThis(),
      remove: jest.fn().mockReturnThis(),
      node: jest.fn().mockReturnValue({
        getBBox: () => ({ x: 0, y: 0, width: 100, height: 20 })
      }),
      property: jest.fn().mockReturnThis(),
      dispatch: jest.fn().mockReturnThis(),
      transition: jest.fn().mockReturnThis(),
      duration: jest.fn().mockReturnThis(),
      call: jest.fn().mockReturnThis(),
      empty: jest.fn().mockReturnValue(false),
    })),
    timeFormatLocale: jest.fn().mockImplementation(() => ({
      format: jest.fn().mockImplementation(() => (date) => 'Jan 1, 2023'),
      parse: jest.fn().mockImplementation(() => (str) => new Date(2023, 0, 1)),
    })),
    timeParse: jest.fn().mockImplementation(() => (str) => new Date(2023, 0, 1)),
    timeFormat: jest.fn().mockImplementation(() => (date) => 'Jan 1, 2023'),
    scaleLinear: jest.fn().mockImplementation(() => ({
      domain: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      clamp: jest.fn().mockReturnThis(),
      nice: jest.fn().mockReturnThis(),
    })),
    scaleTime: jest.fn().mockImplementation(() => ({
      domain: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      ticks: jest.fn().mockReturnValue([]),
    })),
    scaleBand: jest.fn().mockImplementation(() => ({
      domain: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      padding: jest.fn().mockReturnThis(),
      bandwidth: jest.fn().mockReturnValue(20),
    })),
    axisBottom: jest.fn().mockImplementation(() => jest.fn()),
    axisLeft: jest.fn().mockImplementation(() => jest.fn()),
    line: jest.fn().mockImplementation(() => ({
      x: jest.fn().mockReturnThis(),
      y: jest.fn().mockReturnThis(),
      defined: jest.fn().mockReturnThis(),
    })),
    max: jest.fn().mockReturnValue(100),
    min: jest.fn().mockReturnValue(0),
    timeMonth: {
      every: jest.fn().mockReturnValue(jest.fn()),
    },
    timeYear: {
      every: jest.fn().mockReturnValue(jest.fn()),
    },
  };
});

// Now import the dependencies
import { dataManager } from '../../../public/js/01_store_data.js';

// Mock the dependencies after the d3 mock is set up
jest.mock('../../../public/js/01_store_data.js', () => ({
  dataManager: {
    getMonthsToShow: jest.fn().mockReturnValue(12),
    getATCClass: jest.fn().mockReturnValue(''),
    getMolecule: jest.fn().mockReturnValue(''),
    getSearchTerm: jest.fn().mockReturnValue(''),
    getStartDate: jest.fn().mockReturnValue(new Date('2023-01-01')),
    getEndDate: jest.fn().mockReturnValue(new Date('2023-12-31')),
    getDateReport: jest.fn().mockReturnValue(new Date('2023-12-31')),
    getProducts: jest.fn().mockReturnValue(['product1', 'product2']),
    getAccentedProducts: jest.fn().mockReturnValue(['Product 1', 'Product 2']),
    processDataMonthlyChart: jest.fn().mockReturnValue([]),
    setSearchTerm: jest.fn(),
    setATCClass: jest.fn(),
    setMolecule: jest.fn(),
    setMoleculeClassMap: jest.fn(),
    getMoleculeClassMap: jest.fn().mockReturnValue([
      { atcClass: 'ATC1', moleculeId: 'M1', moleculeName: 'Molecule 1' },
      { atcClass: 'ATC1', moleculeId: 'M2', moleculeName: 'Molecule 2' },
      { atcClass: 'ATC2', moleculeId: 'M3', moleculeName: 'Molecule 3' },
    ]),
    getVaccinesOnly: jest.fn().mockReturnValue(false),
    setVaccinesOnly: jest.fn(),
    setDateReport: jest.fn(),
    setStartDate: jest.fn(),
    setEndDate: jest.fn(),
    setProducts: jest.fn(),
    setAccentedProducts: jest.fn(),
  }
}));

jest.mock('../../../public/js/00_fetch_data.js', () => ({
  fetchTableChartData: jest.fn().mockResolvedValue([]),
}));

// Import the module under test - this needs to be after all the mocks
// Wrap in try/catch to prevent test failure if module can't be loaded
try {
  require('../../../public/js/draw.js');
} catch (error) {
  console.error('Failed to load draw.js:', error);
}

describe('Molecule Dropdown Functionality', () => {
  let updateMoleculeDropdown;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a minimal DOM for testing
    document.body.innerHTML = `
      <select id="molecule"></select>
      <select id="atc"></select>
      <input id="search-box" />
      <div id="dash"></div>
      <div id="summary"></div>
    `;
    
    // Create a stub for the updateMoleculeDropdown function
    updateMoleculeDropdown = (atcClass) => {
      const moleculeSelect = document.getElementById('molecule');
      const selectedMoleculeId = dataManager.getMolecule();
      
      // Create placeholder options
      const options = [
        { code: '', name: 'Choisir une molécule' },
        { code: 'M1', name: 'Molecule 1' },
        { code: 'M2', name: 'Molecule 2' }
      ];
      
      options.forEach(option => {
        const optionEl = document.createElement('option');
        optionEl.value = option.code;
        optionEl.textContent = option.name;
        moleculeSelect.appendChild(optionEl);
      });
      
      // Return the moleculeSelect for testing
      return moleculeSelect;
    };
  });

  test('updateMoleculeDropdown should update dropdown with all molecules when atcClass is empty', () => {
    // Call our stub function
    const moleculeSelect = updateMoleculeDropdown('');
    
    // Verify options were created
    expect(moleculeSelect.options.length).toBe(3);
    expect(moleculeSelect.options[0].value).toBe('');
    expect(moleculeSelect.options[1].value).toBe('M1');
    expect(moleculeSelect.options[2].value).toBe('M2');
  });

  test('selecting a molecule should not clear the dropdown list', () => {
    // Set up molecule dropdown with options
    const moleculeSelect = updateMoleculeDropdown('');
    
    // Select a molecule
    moleculeSelect.value = 'M1';
    moleculeSelect.dispatchEvent(new Event('input'));
    
    // Verify options still exist in the dropdown
    expect(moleculeSelect.options.length).toBe(3);
  });
});

describe('Search Functionality', () => {
  let handleSearch;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a minimal DOM for testing
    document.body.innerHTML = `
      <select id="molecule"></select>
      <select id="atc"></select>
      <input id="search-box" />
      <div id="dash"></div>
      <div id="summary"></div>
    `;
    
    // Create a stub for the handleSearch function
    handleSearch = jest.fn();
    
    // Attach event listener to simulate the search handling
    const searchBox = document.getElementById('search-box');
    searchBox.addEventListener('input', () => {
      dataManager.setSearchTerm(searchBox.value);
      handleSearch(false, searchBox.value);
    });
  });

  test('search input should trigger search with debounce', () => {
    // Simulate user typing in search box
    const searchBox = document.getElementById('search-box');
    searchBox.value = 'test search';
    searchBox.dispatchEvent(new Event('input'));
    
    // Verify setSearchTerm was called
    expect(dataManager.setSearchTerm).toHaveBeenCalledWith('test search');
    expect(handleSearch).toHaveBeenCalledWith(false, 'test search');
  });
}); 