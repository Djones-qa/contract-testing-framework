import type { Config } from 'jest';
import baseConfig from '../../jest.config.base';

const config: Config = {
  ...baseConfig,
  displayName: 'verification-runner',
  moduleNameMapper: {
    '^@contract-testing/shared$': '<rootDir>/../../packages/shared/src',
  },
};

export default config;
