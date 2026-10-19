import { closeDatabase, getDatabase } from "../src/lib/server/db";

try {
  await getDatabase();
  console.log("Database migrations are up to date.");
} finally {
  await closeDatabase();
}
