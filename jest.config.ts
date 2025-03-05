import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)', '**/*.integration.[jt]s?(x)'],
  verbose: true,
  automock: false
};

export default config;