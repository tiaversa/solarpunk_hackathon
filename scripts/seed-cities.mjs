// Run with: node scripts/seed-cities.mjs
// Seeds the local Supabase 'cities' table from the cities.json package.
// Set LOCAL_SUPABASE_URL and LOCAL_SERVICE_ROLE_KEY or it defaults to local dev values.

import { createClient } from "@supabase/supabase-js";
import cities from "cities.json" with { type: "json" };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const BATCH_SIZE = 2000;

console.log(`Seeding ${cities.length} cities in batches of ${BATCH_SIZE}...`);

// Clear existing data
const { error: clearError } = await supabase.from("cities").delete().neq("id", 0);
if (clearError) console.warn("Warning clearing cities:", clearError.message);

let inserted = 0;
for (let i = 0; i < cities.length; i += BATCH_SIZE) {
  const batch = cities.slice(i, i + BATCH_SIZE).map((c) => ({
    name: c.name,
    country: c.country,
    admin1: c.admin1 || null,
  }));

  const { error } = await supabase.from("cities").insert(batch);
  if (error) {
    console.error(`Error at batch ${i}: ${error.message}`);
    process.exit(1);
  }
  inserted += batch.length;
  process.stdout.write(`\r${inserted}/${cities.length} inserted...`);
}

console.log(`\nDone! ${inserted} cities seeded.`);
