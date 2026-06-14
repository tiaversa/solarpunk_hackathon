"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, registerUser } from "@/lib/api-client";
import { Backdrop, Sprout } from "@/components/Backdrop";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await registerUser({ email, password });
    } catch (err) {
      setSubmitting(false);
      setError(
        err instanceof ApiError ? err.message : "Could not create account.",
      );
      return;
    }

    // Display name isn't persisted server-side yet; stash it locally so the
    // home greeting can address the user by name.
    const trimmedName = name.trim();
    if (trimmedName && typeof window !== "undefined") {
      try {
        window.localStorage.setItem("solar.displayName", trimmedName);
      } catch {
        // Storage may be unavailable (private mode); greeting falls back to email.
      }
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setSubmitting(false);

    if (!result || result.error) {
      setError("Account created — please sign in.");
      router.push("/sign-in");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-7 py-14">
      <Backdrop />

      <div className="flex flex-col items-center gap-4 text-center">
        <Sprout className="h-20 w-20" />
        <div className="flex flex-col gap-2">
          <h1 className="text-xl uppercase tracking-wide text-solar-sage">
            Join us!
          </h1>
          <p className="text-sm text-solar-sage/90">
            Create account to continue your explorations
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-2 text-sm uppercase tracking-wide text-solar-sage">
          Name
          <input
            type="text"
            autoComplete="name"
            placeholder="Enter name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-field border-2 border-solar-green/50 bg-solar-field/50 px-5 py-4 text-base normal-case tracking-normal text-solar-sage placeholder:text-solar-sage/40 focus:border-solar-green focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm uppercase tracking-wide text-solar-sage">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Enter email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-field border-2 border-solar-green/50 bg-solar-field/50 px-5 py-4 text-base normal-case tracking-normal text-solar-sage placeholder:text-solar-sage/40 focus:border-solar-green focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm uppercase tracking-wide text-solar-sage">
          Password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-field border-2 border-solar-green/50 bg-solar-field/50 px-5 py-4 text-base normal-case tracking-normal text-solar-sage placeholder:text-solar-sage/40 focus:border-solar-green focus:outline-none"
          />
          <span className="text-xs normal-case tracking-normal text-solar-sage/60">
            At least 8 characters.
          </span>
        </label>

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
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="text-center text-sm text-solar-sage/80">Sign up another way</p>

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
