module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
  testPathIgnorePatterns:
    process.env.CI === 'true'
      ? ['/node_modules/']
      : [
          '/node_modules/',
          'test/financial-concurrency.spec.ts',
          'test/idempotency-critical.spec.ts',
          'test/webhook-security.spec.ts',
        ],
};
