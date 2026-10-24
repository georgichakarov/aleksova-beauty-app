import { randomBytes } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const envPath = resolve(".env");
try {
  await access(envPath);
  throw new Error(".env already exists; refusing to overwrite local configuration.");
} catch (error) {
  if (error instanceof Error && "code" in error && error.code !== "ENOENT") throw error;
}

const template = await readFile(resolve(".env.example"), "utf8");
const secretPlaceholder = /^BETTER_AUTH_SECRET=.*$/m;
if (!secretPlaceholder.test(template)) throw new Error(".env.example is missing BETTER_AUTH_SECRET.");

const secret = randomBytes(32).toString("base64url");
const config = template.replace(secretPlaceholder, `BETTER_AUTH_SECRET=${secret}`);
await writeFile(envPath, config, { encoding: "utf8", flag: "wx", mode: 0o600 });
console.log("Created a private .env with a fresh random auth secret and the local demo owner settings.");