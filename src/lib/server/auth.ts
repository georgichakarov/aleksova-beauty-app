import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDatabase } from "./db";
import { account, session, user, verification } from "./schema";

let authPromise: ReturnType<typeof createAuth> | undefined;

async function createAuth() {
  const { db } = await getDatabase();
  const baseURL = process.env["APP_URL"] ?? "http://localhost:3000";
  const secureCookies = process.env["NODE_ENV"] === "production";
  const secret = process.env["BETTER_AUTH_SECRET"];
  if (!secret || secret.length < 32)
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    baseURL,
    secret,
    trustedOrigins: [baseURL],
    emailAndPassword: {
      enabled: true,
      disableSignUp: process.env["OWNER_SETUP"] !== "1",
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: secureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies,
        path: "/",
      },
    },
  });
}

export function getAuth() {
  authPromise ??= createAuth();
  return authPromise;
}

export async function getOwner(request: Request) {
  const email = process.env["OWNER_EMAIL"]?.trim().toLowerCase();
  if (!email) return null;
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || session.user.email.toLowerCase() !== email) return null;
  return session.user;
}
