"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import { Backdrop } from "@/components/Backdrop";
import { Logo } from "@/components/Logo";

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
  const params = useSearchParams();
  const router = useRouter();
  const callbackUrl = params.get("callbackUrl") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setSubmitting(false);

    if (authError) {
      setError("Invalid email or password.");
      return;
    }

    router.push(callbackUrl);
  }

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-7 px-7 py-14">
      <Backdrop />

      <div className="flex flex-col items-center gap-4 text-center">
        <Logo className="h-32 w-32" />
        <div className="flex flex-col gap-2">
          <h1 className="text-xl uppercase tracking-wide text-solar-sage">
            Welcome back
          </h1>
          <p className="text-sm text-solar-sage/90">
            Sign in to continue your explorations
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
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
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-field border-2 border-solar-green/50 bg-solar-field/50 px-5 py-4 pr-16 text-base normal-case tracking-normal text-solar-sage placeholder:text-solar-sage/40 focus:border-solar-green focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center px-5 text-xs font-bold uppercase tracking-wide text-solar-sage/70 hover:text-solar-green"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        {error && (
          <p className="rounded-field bg-solar-danger/15 px-4 py-3 text-sm text-red-300 ring-1 ring-solar-danger/40">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-1 w-full rounded-field bg-solar-green px-5 py-4 text-lg font-extrabold uppercase tracking-[0.3em] text-solar-cream shadow-lg shadow-black/20 transition hover:bg-solar-moss disabled:opacity-60"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="text-center text-sm text-solar-sage/80">Forgot password?</p>

      <div className="flex items-center gap-3 text-sm text-solar-sage">
        <span className="h-px flex-1 bg-solar-line" />
        <span className="font-bold">or</span>
        <span className="h-px flex-1 bg-solar-line" />
      </div>

      <p className="text-center text-sm text-solar-sage/90">
        New here?{" "}
        <Link className="font-bold text-solar-sage hover:text-solar-green" href="/sign-up">
          Create Account
        </Link>
      </p>
    </main>
  );
}
