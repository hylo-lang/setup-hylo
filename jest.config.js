module.exports = {
  clearMocks: true,
  moduleFileExtensions: ['js', 'ts'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  testRunner: 'jest-circus/runner',
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  verbose: true,
  collectCoverage: true,
  coveragePathIgnorePatterns: ["<rootDir>/build/", "<rootDir>/node_modules/", "<rootDir>/tests", "<rootDir>/dist"],
  collectCoverageFrom: [
    "src/**",
    "!**/node_modules/**",
    "!**/build/**",
    "!**/dist/**"
  ]
}