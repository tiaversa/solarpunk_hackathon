"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, registerUser } from "@/lib/api-client";

export default function SignUpPage() {
  const router = useRouter();
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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div className="text-center">
        <span className="text-4xl" aria-hidden="true">
          🌱
        </span>
        <h1 className="mt-2 text-2xl font-bold text-leaf-700">
          Start your missions
        </h1>
      </div>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-leaf-100"
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-leaf-700">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-leaf-100 px-3 py-2 text-base text-leaf-700 focus:border-leaf-500 focus:outline-none focus:ring-1 focus:ring-leaf-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-leaf-700">
          Password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-leaf-100 px-3 py-2 text-base text-leaf-700 focus:border-leaf-500 focus:outline-none focus:ring-1 focus:ring-leaf-500"
          />
          <span className="text-xs font-normal text-leaf-700/70">
            At least 8 characters.
          </span>
        </label>

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
          {submitting ? "Creating account…" : "Create account"}
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
