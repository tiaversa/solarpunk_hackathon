"use client";

import { useState } from "react";
import { type TopicId } from "@/lib/missionMatrix";
import { createClient } from "@/lib/supabase-client";

async function orgFetch(path: string, init?: RequestInit): Promise<Response> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const token = session?.access_token ?? anonKey;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL + "/functions/v1";
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
}

type Topic = { id: TopicId; emoji: string; label: string };

type ServiceRequest = {
  id: string;
  category: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
  radiusKm: number;
  capacityTotal: number;
  capacityRemaining: number;
  expiresAt: string | null;
  status: string;
  createdAt: string;
};

type Props = {
  orgId: string;
  topics: readonly Topic[];
  initialRequests: ServiceRequest[];
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  filled: "Filled",
  expired: "Expired",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-solar-green/20 text-solar-green ring-1 ring-solar-green/40",
  filled: "bg-solar-field text-solar-sage ring-1 ring-solar-leafmd",
  expired: "bg-solar-panel text-solar-sage/40 ring-1 ring-solar-leafmd",
};

const inputClass =
  "rounded-field border-2 border-solar-green/40 bg-solar-field/50 px-4 py-2.5 text-sm text-solar-sage placeholder:text-solar-sage/40 focus:border-solar-green focus:outline-none";
const labelClass =
  "flex flex-col gap-2 text-xs uppercase tracking-wide text-solar-sage";

export function ServiceRequestManager({ orgId, topics, initialRequests }: Props) {
  const [requests, setRequests] = useState<ServiceRequest[]>(initialRequests);
  const [showForm, setShowForm] = useState(false);

  function onCreated(req: ServiceRequest) {
    setRequests((prev) => [req, ...prev]);
    setShowForm(false);
  }

  async function onStatusChange(reqId: string, status: "open" | "filled" | "expired") {
    const res = await orgFetch(`/orgs/${orgId}/requests/${reqId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    if (!res.ok) return;
    setRequests((prev) =>
      prev.map((r) => (r.id === reqId ? { ...r, status } : r)),
    );
  }

  async function onDelete(reqId: string) {
    if (!confirm("Delete this request?")) return;
    const res = await orgFetch(`/orgs/${orgId}/requests/${reqId}`, {
      method: "DELETE",
    });
    if (res.ok || res.status === 204) {
      setRequests((prev) => prev.filter((r) => r.id !== reqId));
    }
  }

  const openRequests = requests.filter((r) => r.status === "open");
  const closedRequests = requests.filter((r) => r.status !== "open");

  return (
    <div className="flex flex-col gap-6">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-solar-cream">Help requests</h2>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-field bg-solar-green px-4 py-2 text-xs font-extrabold uppercase tracking-[0.15em] text-solar-cream transition hover:bg-solar-moss"
        >
          {showForm ? "Cancel" : "+ New request"}
        </button>
      </div>

      {showForm && (
        <ServiceRequestForm orgId={orgId} topics={topics} onCreated={onCreated} />
      )}

      {requests.length === 0 && !showForm && (
        <p className="rounded-field border border-solar-leafmd bg-solar-panel/60 px-4 py-6 text-center text-sm text-solar-sage/80">
          No requests yet. Add one so community members can find and help you.
        </p>
      )}

      {openRequests.length > 0 && (
        <div className="flex flex-col gap-3">
          {openRequests.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              topics={topics}
              onStatusChange={onStatusChange}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {closedRequests.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-solar-sage/60 hover:text-solar-sage">
            Past requests ({closedRequests.length})
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {closedRequests.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                topics={topics}
                onStatusChange={onStatusChange}
                onDelete={onDelete}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New request form
// ---------------------------------------------------------------------------

type FormProps = {
  orgId: string;
  topics: readonly Topic[];
  onCreated: (req: ServiceRequest) => void;
};

function ServiceRequestForm({ orgId, topics, onCreated }: FormProps) {
  const [category, setCategory] = useState<TopicId>(topics[0]!.id);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [capacityTotal, setCapacityTotal] = useState(1);
  const [radiusKm, setRadiusKm] = useState(5);
  const [expiresAt, setExpiresAt] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function captureLocation() {
    if (!("geolocation" in navigator)) {
      setManualMode(true);
      setError("Your browser doesn't support geolocation. Enter coordinates manually.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setError("Location permission denied. Enter coordinates manually below.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setError("Your device couldn't determine a position (no GPS/WiFi signal). Enter coordinates manually below.");
        } else {
          setError("Location timed out. Enter coordinates manually below.");
        }
        setManualMode(true);
      },
      { timeout: 12_000, maximumAge: 60_000, enableHighAccuracy: false },
    );
  }

  function applyManualCoords() {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      setError("Latitude must be between -90 and 90.");
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setError("Longitude must be between -180 and 180.");
      return;
    }
    setCoords({ lat, lng });
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!coords) {
      setError("Location is required — click 'Use my location' first.");
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      const res = await orgFetch(`/orgs/${orgId}/requests`, {
        method: "POST",
        body: JSON.stringify({
          category,
          title: title.trim(),
          description: description.trim(),
          lat: coords.lat,
          lng: coords.lng,
          radiusKm,
          capacityTotal,
          ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Could not create request");
      }

      const { request } = (await res.json()) as { request: ServiceRequest };
      onCreated(request);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-3xl border border-solar-leafmd bg-solar-panel/70 p-5"
    >
      <h3 className="font-bold text-solar-cream">New help request</h3>

      {/* Topic */}
      <label className={labelClass}>
        Topic
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {topics.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setCategory(t.id)}
              className={`flex flex-col items-center gap-1 rounded-2xl border-2 py-2 text-xs font-medium normal-case tracking-normal transition ${
                category === t.id
                  ? "border-solar-green bg-solar-field text-solar-cream"
                  : "border-solar-leafmd text-solar-sage/60 hover:border-solar-green/60 hover:text-solar-sage"
              }`}
            >
              <span className="text-lg">{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>
      </label>

      {/* Title */}
      <label className={labelClass}>
        Title
        <input
          type="text"
          required
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="We need help teaching kids to cook"
          className={`${inputClass} normal-case tracking-normal`}
        />
      </label>

      {/* Description */}
      <label className={labelClass}>
        Description
        <textarea
          required
          minLength={10}
          maxLength={800}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what kind of help you need, who benefits, and any requirements…"
          className={`${inputClass} resize-none normal-case tracking-normal`}
        />
      </label>

      {/* Location */}
      <div className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wide text-solar-sage">
          Location of the activity
        </span>

        {coords ? (
          <div className="flex items-center gap-3 rounded-field bg-solar-field/50 px-3 py-2">
            <span className="text-base">📍</span>
            <span className="text-sm text-solar-sage">
              {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </span>
            <button
              type="button"
              onClick={() => { setCoords(null); setManualMode(false); }}
              className="ml-auto text-xs text-solar-sage/50 hover:text-solar-sage"
            >
              Clear
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={captureLocation}
                disabled={locating}
                className="flex flex-1 items-center justify-center gap-2 rounded-field border border-solar-leafmd px-3 py-2 text-sm text-solar-sage transition hover:bg-solar-field/50 disabled:opacity-60"
              >
                <span>{locating ? "⏳" : "📍"}</span>
                {locating ? "Getting location…" : "Use my current location"}
              </button>
              <button
                type="button"
                onClick={() => { setManualMode((v) => !v); setError(null); }}
                className="rounded-field border border-solar-leafmd px-3 py-2 text-sm text-solar-sage/60 transition hover:bg-solar-field/50 hover:text-solar-sage"
              >
                Enter manually
              </button>
            </div>

            {manualMode && (
              <div className="flex flex-col gap-2 rounded-field bg-solar-field/50 p-3">
                <p className="text-xs text-solar-sage/60">
                  Find your coordinates at{" "}
                  <a
                    href="https://www.latlong.net"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-solar-green underline"
                  >
                    latlong.net
                  </a>{" "}
                  or right-click on Google Maps.
                </p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="any"
                    placeholder="Latitude (e.g. -33.4489)"
                    value={manualLat}
                    onChange={(e) => setManualLat(e.target.value)}
                    className="flex-1 rounded-field border-2 border-solar-green/40 bg-solar-field/50 px-3 py-2 text-sm text-solar-sage placeholder:text-solar-sage/40 focus:border-solar-green focus:outline-none"
                  />
                  <input
                    type="number"
                    step="any"
                    placeholder="Longitude (e.g. -70.6693)"
                    value={manualLng}
                    onChange={(e) => setManualLng(e.target.value)}
                    className="flex-1 rounded-field border-2 border-solar-green/40 bg-solar-field/50 px-3 py-2 text-sm text-solar-sage placeholder:text-solar-sage/40 focus:border-solar-green focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={applyManualCoords}
                    className="rounded-field bg-solar-green px-3 py-2 text-sm font-bold text-solar-cream transition hover:bg-solar-moss"
                  >
                    Set
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-solar-sage/50">
          Used to match nearby community members with your request.
        </p>
      </div>

      {/* Capacity + Radius */}
      <div className="grid grid-cols-2 gap-4">
        <label className={labelClass}>
          Volunteers needed
          <input
            type="number"
            min={1}
            max={500}
            value={capacityTotal}
            onChange={(e) => setCapacityTotal(Number(e.target.value))}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Search radius (km)
          <input
            type="number"
            min={1}
            max={50}
            step={0.5}
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className={inputClass}
          />
        </label>
      </div>

      {/* Expiry */}
      <label className={labelClass}>
        Expires on (optional)
        <input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className={`${inputClass} normal-case tracking-normal`}
        />
      </label>

      {error && (
        <p className="rounded-field bg-solar-danger/15 px-4 py-3 text-sm text-red-300 ring-1 ring-solar-danger/40">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-field bg-solar-green px-4 py-3 text-sm font-extrabold uppercase tracking-[0.15em] text-solar-cream transition hover:bg-solar-moss disabled:opacity-60"
      >
        {submitting ? "Publishing…" : "Publish request"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Single request card
// ---------------------------------------------------------------------------

type CardProps = {
  request: ServiceRequest;
  topics: readonly Topic[];
  onStatusChange: (id: string, status: "open" | "filled" | "expired") => void;
  onDelete: (id: string) => void;
};

function RequestCard({ request: r, topics, onStatusChange, onDelete }: CardProps) {
  const topic = topics.find((t) => t.id === r.category);

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-solar-leafmd bg-solar-panel/70 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-xl" aria-hidden="true">
          {topic?.emoji ?? "📌"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-solar-cream truncate">{r.title}</span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status] ?? STATUS_COLORS.expired}`}
            >
              {STATUS_LABELS[r.status] ?? r.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-solar-sage/80 line-clamp-2">{r.description}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-solar-sage/50">
            <span>{topic?.label ?? r.category}</span>
            <span>
              {r.capacityRemaining}/{r.capacityTotal} spots left
            </span>
            <span>{r.radiusKm} km radius</span>
            {r.expiresAt && (
              <span>
                Expires {new Date(r.expiresAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 border-t border-solar-leafmd pt-2">
        {r.status === "open" && (
          <>
            <button
              type="button"
              onClick={() => onStatusChange(r.id, "filled")}
              className="rounded-field border border-solar-green/50 px-3 py-1 text-xs font-medium text-solar-green transition hover:bg-solar-green/10"
            >
              Mark filled
            </button>
            <button
              type="button"
              onClick={() => onStatusChange(r.id, "expired")}
              className="rounded-field border border-solar-leafmd px-3 py-1 text-xs font-medium text-solar-sage/60 transition hover:bg-solar-field/50 hover:text-solar-sage"
            >
              Close
            </button>
          </>
        )}
        {r.status !== "open" && (
          <button
            type="button"
            onClick={() => onStatusChange(r.id, "open")}
            className="rounded-field border border-solar-leafmd px-3 py-1 text-xs font-medium text-solar-sage transition hover:bg-solar-field/50"
          >
            Reopen
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(r.id)}
          className="ml-auto rounded-field border border-solar-danger/40 px-3 py-1 text-xs font-medium text-red-300 transition hover:bg-solar-danger/15"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
