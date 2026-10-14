// Vitest sets PROD="1" in every worker (Vite mode flags), which the app reads as
// "production". Runs before each test file is imported.
process.env.PROD = "false";

// pg@9 will reject a query sent while the connection is busy (pg@8 only warns). Prisma
// does that inside a transaction when an `include` loads several relations; fail the
// run instead of letting the warning slip by (#12).
process.on("warning", (warning) => {
  if (warning.name === "DeprecationWarning" && warning.message.includes("already executing a query")) {
    throw new Error(`Parallel queries on one connection (pg@9 will reject them): ${warning.stack ?? warning.message}`);
  }
});
