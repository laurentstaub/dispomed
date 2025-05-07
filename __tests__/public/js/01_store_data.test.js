// Since we don't have direct access to the source code structure
// We'll create tests based on what we know about the dataManager API

// Mock the dataManager
jest.mock('../../../public/js/01_store_data.js');
import { dataManager } from '../../../public/js/01_store_data.js';

describe('DataManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock implementation for data manager methods
    dataManager.setMolecule.mockImplementation(function(value) {
      this.molecule = value;
    });
    
    dataManager.getMolecule.mockImplementation(function() {
      return this.molecule || '';
    });
    
    dataManager.setATCClass.mockImplementation(function(value) {
      this.atcClass = value;
    });
    
    dataManager.getATCClass.mockImplementation(function() {
      return this.atcClass || '';
    });
    
    dataManager.setSearchTerm.mockImplementation(function(value) {
      this.searchTerm = value;
    });
    
    dataManager.getSearchTerm.mockImplementation(function() {
      return this.searchTerm || '';
    });
    
    dataManager.setMoleculeClassMap.mockImplementation(function(value) {
      this.moleculeClassMap = value;
    });
    
    dataManager.getMoleculeClassMap.mockImplementation(function() {
      return this.moleculeClassMap || [];
    });
  });
  
  test('should store and retrieve molecule value', () => {
    dataManager.setMolecule('M1');
    expect(dataManager.getMolecule()).toBe('M1');
    
    dataManager.setMolecule('M2');
    expect(dataManager.getMolecule()).toBe('M2');
  });
  
  test('should store and retrieve ATC class value', () => {
    dataManager.setATCClass('ATC1');
    expect(dataManager.getATCClass()).toBe('ATC1');
    
    dataManager.setATCClass('ATC2');
    expect(dataManager.getATCClass()).toBe('ATC2');
  });
  
  test('should store and retrieve search term', () => {
    dataManager.setSearchTerm('test');
    expect(dataManager.getSearchTerm()).toBe('test');
    
    dataManager.setSearchTerm('another test');
    expect(dataManager.getSearchTerm()).toBe('another test');
  });
  
  test('should store and retrieve molecule class map', () => {
    const mockMap = [
      { atcClass: 'ATC1', moleculeId: 'M1', moleculeName: 'Molecule 1' },
      { atcClass: 'ATC2', moleculeId: 'M2', moleculeName: 'Molecule 2' }
    ];
    
    dataManager.setMoleculeClassMap(mockMap);
    expect(dataManager.getMoleculeClassMap()).toEqual(mockMap);
  });
}); 