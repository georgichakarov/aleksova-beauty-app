import "dotenv/config";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { schema } from "./schema";

let databasePromise: Promise<{ client: PGlite; db: ReturnType<typeof drizzle> }> | undefined;

export function getDatabase() {
  databasePromise ??= initializeDatabase();
  return databasePromise;
}

export async function closeDatabase() {
  const database = databasePromise;
  databasePromise = undefined;
  if (database) await (await database).client.close();
}

async function initializeDatabase() {
  const dataDir = resolve(process.env["PGLITE_DATA_DIR"] ?? ".data/postgres");
  await mkdir(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  await client.waitReady;
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: resolve("drizzle") });
  return { client, db };
}
