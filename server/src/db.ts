import postgres from "postgres";

/**
 * Postgres (Neon in production). Null when DATABASE_URL isn't set, so the rest
 * of the API still runs and the visitor book answers 503 instead of crashing.
 * Neon connection strings carry `sslmode=require`, which postgres.js honours.
 */
const url = process.env.DATABASE_URL;
export const sql = url ? postgres(url, { max: 5, idle_timeout: 30 }) : null;

/** Idempotent schema setup, run once on boot. */
export async function migrate(): Promise<void> {
  if (!sql) return;
  await sql`
    create table if not exists guestbook (
      id serial primary key,
      name text not null,
      created_at timestamptz not null default now(),
      hidden boolean not null default false
    )
  `;
  await sql`
    create table if not exists island_wall (
      id serial primary key,
      name text not null,
      message text not null,
      flower text not null,
      color text not null,
      status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
      created_at timestamptz not null default now()
    )
  `;
}
