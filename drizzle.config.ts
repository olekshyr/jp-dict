import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });

// `drizzle-kit generate` diffs the schema against the migration folder and
// never connects, so it stays usable before Neon is configured. Everything else
// (migrate, push, studio) needs a real connection.
const needsConnection = !process.argv.includes("generate");
const url = process.env.DATABASE_URL;

if (!url && needsConnection) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string.",
  );
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: url ?? "" },
});
