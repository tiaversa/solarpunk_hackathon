import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { suggestCityFromHeaders } from "@/lib/geolocation";

// GET /api/geolocation -> { city: string | null }
// Used by the sign-up / preferences UI to pre-fill the editable city field.
export async function GET() {
  const city = await suggestCityFromHeaders(headers());
  return NextResponse.json({ city });
}
