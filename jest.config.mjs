// Monorepo Jest config for both backend (ESM) and frontend (TSX/JSX)

export default {
  projects: [
    {
      displayName: 'backend',
      testEnvironment: 'node',
      // extensionsToTreatAsEsm: ['.js'],
      moduleFileExtensions: ['js', 'mjs', 'cjs', 'json'],
      testMatch: ['<rootDir>/server/__tests__/**/*.js'],
      transform: {},
    },
    {
      displayName: 'frontend',
      testEnvironment: 'jsdom',
      moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json'],
      testMatch: [
        '<rootDir>/client/src/**/*.test.{js,jsx,ts,tsx}',
        '<rootDir>/tests/e2e/**/*.spec.{js,ts,tsx}'
      ],
      transform: {
        '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['@babel/preset-env', '@babel/preset-react', '@babel/preset-typescript'] }],
      },
      transformIgnorePatterns: [
        '/node_modules/'
      ],
      // setupFilesAfterEnv: [
      //   '<rootDir>/client/jest.setup.js'
      // ],
    }
  ]
};