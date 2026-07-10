import { assertIntegrationDatabaseConfig } from './helpers/database';

jest.setTimeout(30000);

assertIntegrationDatabaseConfig(
  process.env.INTEGRATION_TEST_OPTIONAL === 'true',
);
