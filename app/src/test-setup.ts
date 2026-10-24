// Each Vitest worker has an isolated in-memory database. No production paths are opened.
process.env.DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";
