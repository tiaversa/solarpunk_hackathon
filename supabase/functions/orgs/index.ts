import { z } from "npm:zod@3";
import { handleCors, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { getSupabaseAdmin } from "../_shared/supabase.ts";
import { TOPIC_IDS } from "../_shared/missionMatrix.ts";

// ---- Zod schemas -------------------------------------------------------------
const CreateOrgBody = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  website: z.string().url().optional(),
  city: z.string().max(100).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

const PatchOrgBody = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).optional(),
  phone: z.string().max(30).optional(),
  website: z.string().url().optional(),
  city: z.string().max(100).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

const CreateRequestBody = z.object({
  category: z.string().refine((v) => (TOPIC_IDS as readonly string[]).includes(v), {
    message: `category must be one of: ${TOPIC_IDS.join(", ")}`,
  }),
  title: z.string().min(5).max(120),
  description: z.string().min(10).max(800),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusKm: z.number().min(0.5).max(50).default(5),
  capacityTotal: z.number().int().min(1).max(500).default(1),
  expiresAt: z.string().datetime().optional(),
});

const PatchRequestBody = z
  .object({
    title: z.string().min(5).max(120).optional(),
    description: z.string().min(10).max(800).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    radiusKm: z.number().min(0.5).max(50).optional(),
    capacityRemaining: z.number().int().min(0).optional(),
    status: z.enum(["open", "filled", "expired"]).optional(),
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Provide at least one field to update",
  });

// ---- Router ------------------------------------------------------------------
Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  // Strip base prefix, then match patterns
  const path = url.pathname.replace(/^.*\/orgs/, "");

  // GET /orgs  or  POST /orgs
  if (path === "" || path === "/") {
    if (req.method === "GET") return handleListOrgs(req);
    if (req.method === "POST") return handleCreateOrg(req);
  }

  // Routes with orgId
  const orgIdMatch = path.match(/^\/([^/]+)(\/.*)?$/);
  if (!orgIdMatch) return json({ error: "Not found" }, 404);
  const orgId = orgIdMatch[1];
  const subpath = orgIdMatch[2] ?? "";

  if (subpath === "" || subpath === "/") {
    if (req.method === "GET") return handleGetOrg(orgId);
    if (req.method === "PATCH") return handlePatchOrg(req, orgId);
  }

  if (subpath === "/requests" || subpath === "/requests/") {
    if (req.method === "GET") return handleListRequests(req, orgId);
    if (req.method === "POST") return handleCreateRequest(req, orgId);
  }

  const reqIdMatch = subpath.match(/^\/requests\/([^/]+)$/);
  if (reqIdMatch) {
    const requestId = reqIdMatch[1];
    if (req.method === "GET") return handleGetRequest(orgId, requestId);
    if (req.method === "PATCH") return handlePatchRequest(req, orgId, requestId);
    if (req.method === "DELETE") return handleDeleteRequest(req, orgId, requestId);
  }

  return json({ error: "Not found" }, 404);
});

// ---- Org handlers ------------------------------------------------------------
async function handleListOrgs(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 50);
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("Organization")
    .select("id, name, description, email, phone, website, city, lat, lng, createdAt")
    .order("createdAt", { ascending: false })
    .limit(limit + 1);

  if (cursor) query = query.lt("createdAt", cursor);

  const { data: orgs } = await query;
  const items = orgs ?? [];
  const hasNext = items.length > limit;
  const page = hasNext ? items.slice(0, limit) : items;
  const nextCursor = hasNext ? page[page.length - 1]?.createdAt : null;

  return json({ items: page, nextCursor });
}

async function handleCreateOrg(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const parsed = CreateOrgBody.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase.from("Organization").select("id").eq("email", parsed.data.email).maybeSingle();
  if (existing) return json({ error: "An organisation with this email already exists" }, 409);

  const { data: org } = await supabase
    .from("Organization")
    .insert({ ...parsed.data, createdByUserId: auth.userId })
    .select("id, name, description, email, phone, website, city, lat, lng, createdAt")
    .single();

  return json({ org }, 201);
}

async function handleGetOrg(orgId: string): Promise<Response> {
  const supabase = getSupabaseAdmin();
  const { data: org } = await supabase
    .from("Organization")
    .select("id, name, description, email, phone, website, city, lat, lng, createdAt")
    .eq("id", orgId)
    .single();

  if (!org) return json({ error: "Organisation not found" }, 404);
  return json({ org });
}

async function handlePatchOrg(req: Request, orgId: string): Promise<Response> {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;

  const supabase = getSupabaseAdmin();
  const { data: org } = await supabase.from("Organization").select("createdByUserId").eq("id", orgId).single();
  if (!org) return json({ error: "Organisation not found" }, 404);
  if (org.createdByUserId !== auth.userId) return json({ error: "Forbidden" }, 403);

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const parsed = PatchOrgBody.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);

  const update = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
  const { data: updated } = await supabase
    .from("Organization")
    .update(update)
    .eq("id", orgId)
    .select("id, name, description, email, phone, website, city, lat, lng, updatedAt")
    .single();

  return json({ org: updated });
}

// ---- Request handlers --------------------------------------------------------
async function handleListRequests(req: Request, orgId: string): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status") ?? "open";
  const supabase = getSupabaseAdmin();

  const { data: orgExists } = await supabase.from("Organization").select("id").eq("id", orgId).maybeSingle();
  if (!orgExists) return json({ error: "Organisation not found" }, 404);

  let query = supabase
    .from("ServiceRequest")
    .select("id, category, title, description, lat, lng, radiusKm, capacityTotal, capacityRemaining, expiresAt, status, createdAt")
    .eq("organizationId", orgId)
    .order("createdAt", { ascending: false });

  if (statusFilter !== "all") query = query.eq("status", statusFilter);

  const { data: requests } = await query;
  return json({ requests: requests ?? [] });
}

async function handleCreateRequest(req: Request, orgId: string): Promise<Response> {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;

  const supabase = getSupabaseAdmin();
  const { data: org } = await supabase.from("Organization").select("createdByUserId").eq("id", orgId).single();
  if (!org) return json({ error: "Organisation not found" }, 404);
  if (org.createdByUserId !== auth.userId) return json({ error: "Forbidden" }, 403);

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const parsed = CreateRequestBody.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);

  const { data: request } = await supabase
    .from("ServiceRequest")
    .insert({
      organizationId: orgId,
      ...parsed.data,
      capacityRemaining: parsed.data.capacityTotal,
      status: "open",
    })
    .select("id, category, title, description, lat, lng, radiusKm, capacityTotal, capacityRemaining, expiresAt, status, createdAt")
    .single();

  return json({ request }, 201);
}

async function handleGetRequest(orgId: string, requestId: string): Promise<Response> {
  const supabase = getSupabaseAdmin();
  const { data: request } = await supabase
    .from("ServiceRequest")
    .select("id, category, title, description, lat, lng, radiusKm, capacityTotal, capacityRemaining, expiresAt, status, createdAt, updatedAt, Organization(id, name)")
    .eq("id", requestId)
    .eq("organizationId", orgId)
    .single();

  if (!request) return json({ error: "Request not found" }, 404);
  return json({ request });
}

async function handlePatchRequest(req: Request, orgId: string, requestId: string): Promise<Response> {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;

  const supabase = getSupabaseAdmin();
  const { data: sr } = await supabase
    .from("ServiceRequest")
    .select("id, Organization(createdByUserId)")
    .eq("id", requestId).eq("organizationId", orgId)
    .single();

  if (!sr) return json({ error: "Request not found" }, 404);
  const org = sr.Organization as { createdByUserId: string };
  if (org.createdByUserId !== auth.userId) return json({ error: "Forbidden" }, 403);

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const parsed = PatchRequestBody.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);

  const update = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
  const { data: updated } = await supabase
    .from("ServiceRequest")
    .update(update)
    .eq("id", requestId)
    .select("id, category, title, description, lat, lng, radiusKm, capacityTotal, capacityRemaining, expiresAt, status, updatedAt")
    .single();

  return json({ request: updated });
}

async function handleDeleteRequest(req: Request, orgId: string, requestId: string): Promise<Response> {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;

  const supabase = getSupabaseAdmin();
  const { data: sr } = await supabase
    .from("ServiceRequest")
    .select("id, Organization(createdByUserId)")
    .eq("id", requestId).eq("organizationId", orgId)
    .single();

  if (!sr) return json({ error: "Request not found" }, 404);
  const org = sr.Organization as { createdByUserId: string };
  if (org.createdByUserId !== auth.userId) return json({ error: "Forbidden" }, 403);

  await supabase.from("ServiceRequest").delete().eq("id", requestId);
  return new Response(null, { status: 204 });
}
