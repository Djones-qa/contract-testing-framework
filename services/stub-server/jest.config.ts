import type { Config } from 'jest';
import baseConfig from '../../jest.config.base';

const config: Config = {
  ...baseConfig,
  displayName: 'stub-server',
  moduleNameMapper: {
    '^@contract-testing/shared$': '<rootDir>/../../packages/shared/src',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        paths: {
          '@contract-testing/shared': ['../../packages/shared/src'],
        },
      },
    }],
  },
};

export default config;
