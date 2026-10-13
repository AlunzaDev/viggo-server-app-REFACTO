-- Runs once, when the Postgres data directory is first created.
-- Separate database for the integration tests (`npm test`), so they never touch dev data.
CREATE DATABASE viggo_administrativo_test;
