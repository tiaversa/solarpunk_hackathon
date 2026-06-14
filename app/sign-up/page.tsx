"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, registerUser } from "@/lib/api-client";
import { Backdrop } from "@/components/Backdrop";
import { Logo } from "@/components/Logo";
import { CityCombobox } from "@/components/CityCombobox";
import { createClient } from "@/lib/supabase-client";

type AccountType = "person" | "org";

const inputClass =
  "w-full rounded-field border-2 border-solar-green/50 bg-solar-field/50 px-5 py-4 text-base normal-case tracking-normal text-solar-sage placeholder:text-solar-sage/40 focus:border-solar-green focus:outline-none";
const labelClass =
  "flex flex-col gap-2 text-sm uppercase tracking-wide text-solar-sage";

export default function SignUpPage() {
  const router = useRouter();
  const [accountType, setAccountType] = useState<AccountType>("person");

  // Person-only
  const [name, setName] = useState("");

  // Shared
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Org-only
  const [orgName, setOrgName] = useState("");
  const [orgDescription, setOrgDescription] = useState("");
  const [orgCity, setOrgCity] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    let registered: Awaited<ReturnType<typeof registerUser>>;
    try {
      registered = await registerUser({
        email,
        password,
        ...(accountType === "org"
          ? {
              org: {
                name: orgName,
                ...(orgDescription.trim() && { description: orgDescription.trim() }),
                ...(orgCity.trim() && { city: orgCity.trim() }),
              },
            }
          : {}),
      });
    } catch (err) {
      setSubmitting(false);
      setError(
        err instanceof ApiError ? err.message : "Could not create account.",
      );
      return;
    }

    const { org: createdOrg } = registered;

    // Display name isn't persisted server-side yet; stash it locally so the
    // home greeting can address the user by name.
    const trimmedName = name.trim();
    if (accountType === "person" && trimmedName && typeof window !== "undefined") {
      try {
        window.localStorage.setItem("solar.displayName", trimmedName);
      } catch {
        // Storage may be unavailable (private mode); greeting falls back to email.
      }
    }

    // Sign in with Supabase Auth after registration
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setSubmitting(false);

    if (signInError) {
      setError("Account created — please sign in.");
      router.push("/sign-in");
      return;
    }

    window.location.href = createdOrg ? `/org/${createdOrg.id}` : "/";
  }

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-7 py-14">
      <Backdrop />

      <div className="flex flex-col items-center gap-4 text-center">
        <Logo className="h-32 w-32" />
        <div className="flex flex-col gap-2">
          <h1 className="text-xl uppercase tracking-wide text-solar-sage">
            Join us!
          </h1>
          <p className="text-sm text-solar-sage/90">
            Create account to continue your explorations
          </p>
        </div>
      </div>

      {/* Account type toggle */}
      <div className="flex overflow-hidden rounded-field border-2 border-solar-green/40 bg-solar-field/40">
        {(["person", "org"] as AccountType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setAccountType(type)}
            className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs font-bold uppercase tracking-wide transition ${
              accountType === type
                ? "bg-solar-green text-solar-cream"
                : "text-solar-sage/60 hover:text-solar-sage"
            }`}
          >
            <span className="text-lg" aria-hidden="true">
              {type === "person" ? "🙋" : "🏘️"}
            </span>
            {type === "person" ? "Personal" : "Organisation"}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        {accountType === "person" && (
          <label className={labelClass}>
            Name
            <input
              type="text"
              autoComplete="name"
              placeholder="Enter name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </label>
        )}

        <label className={labelClass}>
          Email
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Enter email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          <span className="text-xs normal-case tracking-normal text-solar-sage/60">
            At least 8 characters.
          </span>
        </label>

        {accountType === "org" && (
          <>
            <p className="text-xs normal-case tracking-normal text-solar-sage/60">
              Your organisation profile — you can edit these later.
            </p>

            <label className={labelClass}>
              Organisation name
              <input
                type="text"
                required
                maxLength={120}
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Jardín Comunitario El Roble"
                className={inputClass}
              />
            </label>

            <label className={labelClass}>
              Description
              <textarea
                maxLength={500}
                rows={3}
                value={orgDescription}
                onChange={(e) => setOrgDescription(e.target.value)}
                placeholder="What does your organisation do? (optional)"
                className={`${inputClass} resize-none`}
              />
            </label>

            <label className={labelClass}>
              City
              <CityCombobox
                value={orgCity}
                onChange={setOrgCity}
                placeholder="Santiago (optional)"
              />
            </label>
          </>
        )}

        {error && (
          <p className="rounded-field bg-solar-danger/15 px-4 py-3 text-sm text-red-300 ring-1 ring-solar-danger/40">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-1 w-full rounded-field bg-solar-green px-5 py-4 text-lg font-extrabold uppercase tracking-[0.2em] text-solar-cream shadow-lg shadow-black/20 transition hover:bg-solar-moss disabled:opacity-60"
        >
          {submitting
            ? "Creating account…"
            : accountType === "org"
              ? "Create organisation account"
              : "Create account"}
        </button>
      </form>

      <div className="flex items-center gap-3 text-sm text-solar-sage">
        <span className="h-px flex-1 bg-solar-line" />
        <span className="font-bold">or</span>
        <span className="h-px flex-1 bg-solar-line" />
      </div>

      <p className="text-center text-sm text-solar-sage/90">
        Returning?{" "}
        <Link className="font-bold text-solar-sage hover:text-solar-green" href="/sign-in">
          Sign In
        </Link>
      </p>
    </main>
  );
}
