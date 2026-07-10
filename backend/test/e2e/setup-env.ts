import {
  assertIntegrationDatabaseConfig,
  getIntegrationDatabaseConfig,
} from '../integration/helpers/database';

assertIntegrationDatabaseConfig();

const database = getIntegrationDatabaseConfig();

Object.assign(process.env, {
  NODE_ENV: 'test',
  DB_HOST: database.host,
  DB_PORT: String(database.port),
  DB_USERNAME: database.username,
  DB_PASSWORD: database.password,
  DB_NAME: database.database,
  JWT_SECRET: 'filmott-e2e-jwt-secret',
  FRONTEND_URL: 'http://localhost:3000',
  CORS_ORIGIN: 'http://e2e.filmott.local,http://localhost:3000',
  GOOGLE_CLIENT_ID: 'e2e-google-client',
  GOOGLE_CLIENT_SECRET: 'e2e-google-secret',
  GOOGLE_CALLBACK_URL: 'http://localhost:3001/api/auth/google/callback',
  KAKAO_CLIENT_ID: 'e2e-kakao-client',
  KAKAO_CLIENT_SECRET: 'e2e-kakao-secret',
  KAKAO_CALLBACK_URL: 'http://localhost:3001/api/auth/kakao/callback',
  NAVER_CLIENT_ID: 'e2e-naver-client',
  NAVER_CLIENT_SECRET: 'e2e-naver-secret',
  NAVER_CALLBACK_URL: 'http://localhost:3001/api/auth/naver/callback',
  OPENAI_API_KEY: '',
  TMDB_API_KEY: '',
  KOBIS_API_KEY: '',
  REVALIDATE_SECRET: '',
});
