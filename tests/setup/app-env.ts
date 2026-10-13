// Vitest sets PROD="1" in every worker (Vite mode flags), which the app reads as
// "production". Runs before each test file is imported.
process.env.PROD = "false";
