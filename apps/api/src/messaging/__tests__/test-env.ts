/* eslint-disable turbo/no-undeclared-env-vars */
process.env.DATABASE_URL ??=
  "postgresql://user:password@unit-test.invalid/database";
process.env.BETTER_AUTH_SECRET ??= "unit-test-secret-that-is-long-enough-32";
process.env.BETTER_AUTH_URL ??= "http://localhost:4000";
process.env.FRONTEND_ORIGINS ??= "http://localhost:3000";
process.env.NODE_ENV ??= "test";
