export default {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!d3|internmap|delaunator|robust-predicates)',
  ],
  moduleFileExtensions: ['js', 'json'],
  moduleNameMapper: {
    '^d3$': '<rootDir>/node_modules/d3/dist/d3.min.js',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  collectCoverageFrom: [
    'public/js/**/*.js',
    '!**/node_modules/**',
    '!**/vendor/**',
  ],
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
}; 