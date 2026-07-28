import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

// The only place in the app that reads process.env for the database. Keeping
// the credential confined to the data layer is the point of the DAL.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string.",
  );
}

/*
 * The neon-http driver sends each statement as a single HTTP request. That is
 * the right trade-off for an app on serverless (no connection pool to exhaust,
 * no cold-start handshake), and the wrong one for bulk loading — the importer
 * uses a plain `pg` TCP connection instead.
 */
export const db = drizzle(neon(connectionString), { schema });
