import { NextResponse } from "next/server";
// cities.json stays server-side — never sent to the client bundle.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ALL_CITIES = require("cities.json") as Array<{
  name: string;
  country: string;
}>;

const MAX_RESULTS = 8;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();

  if (q.length < 2) {
    return NextResponse.json({ cities: [] });
  }

  // Prioritise cities whose name starts with the query, then those that
  // contain it anywhere. Both groups are limited to MAX_RESULTS total.
  const startsWith: string[] = [];
  const contains: string[] = [];

  for (const city of ALL_CITIES) {
    const name = city.name.toLowerCase();
    if (name.startsWith(q)) {
      startsWith.push(`${city.name}, ${city.country}`);
    } else if (contains.length + startsWith.length < MAX_RESULTS * 2 && name.includes(q)) {
      contains.push(`${city.name}, ${city.country}`);
    }
    if (startsWith.length >= MAX_RESULTS) break;
  }

  const cities = [...startsWith, ...contains].slice(0, MAX_RESULTS);
  return NextResponse.json({ cities });
}
