"use client";

import { useEffect, useMemo, useState } from "react";
import { TOPICS, getTopic, isTopicId, type TopicId } from "@/lib/missionMatrix";
import {
  distanceKm,
  getCoords,
  getFreshCoordsIfNeeded,
  saveCachedCoords,
  type Coords,
} from "@/lib/gps";

export type SideQuest = {
  id: string;
  category: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
  radiusKm: number;
  capacityRemaining: number;
  capacityTotal: number;
  expiresAt: string | null;
  createdAt: string;
  orgName: string;
  orgCity: string | null;
  orgEmail: string | null;
  orgWebsite: string | null;
};

type Props = {
  quests: SideQuest[];
  userCity: string | null;
};

type LocationState = "idle" | "locating" | "ready" | "denied";

const RADIUS_OPTIONS = [
  { value: 0, label: "Any distance" },
  { value: 5, label: "Within 5 km" },
  { value: 10, label: "Within 10 km" },
  { value: 25, label: "Within 25 km" },
  { value: 50, label: "Within 50 km" },
];

export function CitySideQuestList({ quests, userCity }: Props) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locationState, setLocationState] = useState<LocationState>("idle");
  const [topicFilter, setTopicFilter] = useState<TopicId | "all">("all");
  const [maxKm, setMaxKm] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    setLocationState("locating");
    getFreshCoordsIfNeeded()
      .then((res) => {
        if (cancelled) return;
        if (res) {
          setCoords(res.coords);
          setLocationState("ready");
        } else {
          setLocationState("denied");
        }
      })
      .catch(() => {
        if (!cancelled) setLocationState("denied");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function requestLocation() {
    setLocationState("locating");
    const fresh = await getCoords();
    if (fresh) {
      saveCachedCoords(fresh);
      setCoords(fresh);
      setLocationState("ready");
    } else {
      setLocationState("denied");
    }
  }

  const decorated = useMemo(() => {
    const withDistance = quests.map((q) => ({
      quest: q,
      distance: coords ? distanceKm(coords, { lat: q.lat, lng: q.lng }) : null,
    }));

    const filtered = withDistance.filter(({ quest, distance }) => {
      if (topicFilter !== "all" && quest.category !== topicFilter) return false;
      if (maxKm > 0 && distance !== null && distance > maxKm) return false;
      return true;
    });

    if (coords) {
      filtered.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    }
    return filtered;
  }, [quests, coords, topicFilter, maxKm]);

  const availableTopics = useMemo(() => {
    const ids = new Set(quests.map((q) => q.category));
    return TOPICS.filter((t) => ids.has(t.id));
  }, [quests]);

  return (
    <div className="flex flex-col gap-5">
      {/* Location banner */}
      <div className="rounded-field border border-solar-leafmd bg-solar-panel/60 px-4 py-3 text-sm text-solar-sage/80">
        {locationState === "locating" && (
          <span>
            📍 Finding quests near {userCity ? userCity : "you"}…
          </span>
        )}
        {locationState === "ready" && (
          <span>
            📍 Showing quests near {userCity ? userCity : "you"}, sorted by
            distance.
          </span>
        )}
        {locationState === "denied" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Share your location to sort quests by how close they are
              {userCity ? ` to ${userCity}` : ""}.
            </span>
            <button
              type="button"
              onClick={requestLocation}
              className="rounded-field bg-solar-green px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.15em] text-solar-cream transition hover:bg-solar-moss"
            >
              Use my location
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      {quests.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <FilterChip
              active={topicFilter === "all"}
              onClick={() => setTopicFilter("all")}
              label="All"
            />
            {availableTopics.map((t) => (
              <FilterChip
                key={t.id}
                active={topicFilter === t.id}
                onClick={() => setTopicFilter(t.id)}
                label={`${t.emoji} ${t.label}`}
              />
            ))}
          </div>

          {coords && (
            <select
              value={maxKm}
              onChange={(e) => setMaxKm(Number(e.target.value))}
              className="w-full rounded-field border-2 border-solar-green/40 bg-solar-field/50 px-4 py-2.5 text-sm text-solar-sage focus:border-solar-green focus:outline-none"
            >
              {RADIUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* List */}
      {quests.length === 0 ? (
        <EmptyState message="No open help requests right now. Check back soon — organisations post new quests regularly." />
      ) : decorated.length === 0 ? (
        <EmptyState message="No quests match your filters. Try widening the distance or picking a different topic." />
      ) : (
        <ol className="flex flex-col gap-4">
          {decorated.map(({ quest, distance }) => (
            <QuestCard key={quest.id} quest={quest} distance={distance} />
          ))}
        </ol>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-bold transition ${
        active
          ? "bg-solar-green text-solar-cream"
          : "bg-solar-field text-solar-sage ring-1 ring-solar-leafmd hover:text-solar-cream"
      }`}
    >
      {label}
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <section className="rounded-field border border-solar-leafmd bg-solar-panel/60 p-8 text-center text-sm text-solar-sage/80">
      <p>{message}</p>
    </section>
  );
}

function QuestCard({
  quest: q,
  distance,
}: {
  quest: SideQuest;
  distance: number | null;
}) {
  const topic = isTopicId(q.category) ? getTopic(q.category) : null;

  return (
    <li className="flex flex-col gap-3 rounded-3xl border border-solar-leafmd bg-solar-panel/70 p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-2xl" aria-hidden="true">
          {topic?.emoji ?? "📌"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold text-solar-cream">{q.title}</h2>
            {distance !== null && (
              <span className="shrink-0 rounded-full bg-solar-green/20 px-2 py-0.5 text-xs font-medium text-solar-green ring-1 ring-solar-green/40">
                {formatDistance(distance)}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-solar-sage/60">
            {q.orgName}
            {q.orgCity ? ` · ${q.orgCity}` : ""}
          </p>
        </div>
      </div>

      <p className="text-sm text-solar-sage/80">{q.description}</p>

      <div className="flex flex-wrap gap-3 text-xs text-solar-sage/50">
        <span>{topic?.label ?? q.category}</span>
        <span>
          {q.capacityRemaining}/{q.capacityTotal} spot
          {q.capacityTotal !== 1 ? "s" : ""} left
        </span>
        {q.expiresAt && (
          <span>Expires {new Date(q.expiresAt).toLocaleDateString()}</span>
        )}
      </div>

      {(q.orgEmail || q.orgWebsite) && (
        <div className="flex flex-wrap gap-2 border-t border-solar-leafmd pt-3">
          {q.orgEmail && (
            <a
              href={`mailto:${q.orgEmail}?subject=${encodeURIComponent(`Helping with: ${q.title}`)}`}
              className="rounded-field bg-solar-green px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.15em] text-solar-cream transition hover:bg-solar-moss"
            >
              Offer to help
            </a>
          )}
          {safeHttpUrl(q.orgWebsite) && (
            <a
              href={safeHttpUrl(q.orgWebsite)!}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-field border border-solar-leafmd px-3 py-1.5 text-xs font-medium text-solar-sage transition hover:bg-solar-field/50 hover:text-solar-cream"
            >
              Visit org
            </a>
          )}
        </div>
      )}
    </li>
  );
}

// Only allow http/https URLs as anchor hrefs to block unsafe schemes such as
// javascript: or data: that would execute on click.
function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}
