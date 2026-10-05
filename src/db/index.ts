import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";

export class DatabaseUnavailableError extends Error {
  constructor() {
    super("The Vicus database is unavailable.");
    this.name = "DatabaseUnavailableError";
  }
}

type Database = ReturnType<typeof createDatabase>;

function createDatabase(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

let cachedDatabase: Database | undefined;
let cachedDatabaseUrl: string | undefined;

export function getDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new DatabaseUnavailableError();
  }

  if (!cachedDatabase || cachedDatabaseUrl !== databaseUrl) {
    cachedDatabase = createDatabase(databaseUrl);
    cachedDatabaseUrl = databaseUrl;
  }

  return cachedDatabase;
}

export function toDatabaseUnavailableError(operation: string): DatabaseUnavailableError {
  console.error(`[database] ${operation} failed`);
  return new DatabaseUnavailableError();
}

export function isDatabaseUnavailableError(error: unknown): error is DatabaseUnavailableError {
  return error instanceof DatabaseUnavailableError;
}
