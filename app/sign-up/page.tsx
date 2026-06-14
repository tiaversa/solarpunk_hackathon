"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, registerUser } from "@/lib/api-client";
import { CityCombobox } from "@/components/CityCombobox";
import { createClient } from "@/lib/supabase-client";

type AccountType = "person" | "org";

export default function SignUpPage() {
  const router = useRouter();
  const [accountType, setAccountType] = useState<AccountType>("person");

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

    // Sign in with Supabase Auth after registration
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setSubmitting(false);

    if (signInError) {
      setError("Account created — please sign in.");
      router.push("/sign-in");
      return;
    }

    window.location.href = createdOrg ? `/org/${createdOrg.id}` : "/";
  }

  const inputClass =
    "rounded-lg border border-leaf-100 px-3 py-2 text-base text-leaf-700 focus:border-leaf-500 focus:outline-none focus:ring-1 focus:ring-leaf-500";
  const labelClass = "flex flex-col gap-1 text-sm font-medium text-leaf-700";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div className="text-center">
        <span className="text-4xl" aria-hidden="true">
          🌱
        </span>
        <h1 className="mt-2 text-2xl font-bold text-leaf-700">
          Join Solarpunk Missions
        </h1>
      </div>

      {/* Account type toggle */}
      <div className="flex overflow-hidden rounded-xl border border-leaf-200 bg-leaf-50">
        {(["person", "org"] as AccountType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setAccountType(type)}
            className={`flex flex-1 flex-col items-center gap-1 py-3 text-sm font-semibold transition ${
              accountType === type
                ? "bg-white text-leaf-700 shadow-sm"
                : "text-leaf-700/60 hover:text-leaf-700"
            }`}
          >
            <span className="text-xl" aria-hidden="true">
              {type === "person" ? "🙋" : "🏘️"}
            </span>
            {type === "person" ? "Personal account" : "Organisation"}
          </button>
        ))}
      </div>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-leaf-100"
      >
        <label className={labelClass}>
          Email
          <input
            type="email"
            required
            autoComplete="email"
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          <span className="text-xs font-normal text-leaf-700/70">
            At least 8 characters.
          </span>
        </label>

        {accountType === "org" && (
          <>
            <hr className="border-leaf-100" />
            <p className="text-xs text-leaf-700/60">
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
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-lg bg-leaf-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-leaf-700 disabled:opacity-60"
        >
          {submitting
            ? "Creating account…"
            : accountType === "org"
              ? "Create organisation account"
              : "Create account"}
        </button>
      </form>

      <p className="text-center text-sm text-leaf-700/80">
        Already have an account?{" "}
        <Link
          className="font-semibold text-leaf-700 underline underline-offset-2"
          href="/sign-in"
        >
          Sign in
        </Link>
      </p>
    </main>
  );
}
