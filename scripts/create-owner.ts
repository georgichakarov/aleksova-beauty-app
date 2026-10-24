import { createInterface } from "node:readline/promises";
import { closeDatabase, getDatabase } from "../src/lib/server/db";
import { getAuth } from "../src/lib/server/auth";

function readSecret(label: string) {
  return new Promise<string>((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY) return reject(new Error("Run owner setup in an interactive terminal."));
    process.stdout.write(label);
    input.setRawMode(true);
    input.resume();
    let secret = "";
    const onData = (chunk: Buffer) => {
      const value = chunk.toString("utf8");
      if (value === "\u0003") {
        input.setRawMode(false);
        input.off("data", onData);
        reject(new Error("Owner setup cancelled."));
        return;
      }
      if (value === "\r" || value === "\n") {
        input.setRawMode(false);
        input.off("data", onData);
        process.stdout.write("\n");
        resolve(secret);
      } else if (value === "\u007f" || value === "\b") {
        secret = secret.slice(0, -1);
      } else if (value >= " ") {
        secret += value;
      }
    };
    input.on("data", onData);
  });
}

const ownerEmail = process.env["OWNER_EMAIL"]?.trim().toLowerCase();
if (!ownerEmail) throw new Error("Set OWNER_EMAIL in .env before creating the owner account.");

const prompt = createInterface({ input: process.stdin, output: process.stdout });
let databaseOpen = false;
try {
  const { client } = await getDatabase();
  databaseOpen = true;
  const count = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM "user"');
  if (Number(count.rows[0]?.count ?? 0) > 0)
    throw new Error("An account already exists. Public owner registration is disabled.");
  const name = process.env["OWNER_NAME"]?.trim() || (await prompt.question("Owner name: ")).trim();
  prompt.close();
  const password = await readSecret("Password (12-128 characters): ");
  const confirmation = await readSecret("Confirm password: ");
  if (password.length < 12 || password.length > 128)
    throw new Error("Password must be 12-128 characters.");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  if (name.length < 2 || name.length > 100)
    throw new Error("Enter a name between 2 and 100 characters.");
  process.env["OWNER_SETUP"] = "1";
  const auth = await getAuth();
  const result = await auth.api.signUpEmail({
    body: { name, email: ownerEmail, password },
    headers: new Headers({ origin: process.env["APP_URL"] ?? "http://localhost:3000" }),
  });
  if (!result.user) throw new Error("Owner account could not be created.");
  console.log(`Owner account created for ${ownerEmail}. Sign-up is disabled in the application.`);
} finally {
  prompt.close();
  if (databaseOpen) await closeDatabase();
}
