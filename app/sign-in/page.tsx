"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export default function SignInPage() {
  return (
    // Wrapping the inner client form in <Suspense> satisfies Next 14's
    // CSR bailout requirement for useSearchParams() during static export.
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    setSubmitting(false);

    if (!result || result.error) {
      setError("Invalid email or password.");
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div className="text-center">
        <span className="text-4xl" aria-hidden="true">
          🌱
        </span>
        <h1 className="mt-2 text-2xl font-bold text-leaf-700">
          Welcome back
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-leaf-100 px-3 py-2 text-base text-leaf-700 focus:border-leaf-500 focus:outline-none focus:ring-1 focus:ring-leaf-500"
          />
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
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="text-center text-sm text-leaf-700/80">
        New here?{" "}
        <Link
          className="font-semibold text-leaf-700 underline underline-offset-2"
          href="/sign-up"
        >
          Create an account
        </Link>
      </p>
    </main>
  );
}
