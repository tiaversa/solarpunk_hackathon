"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { AppHeader } from "@/components/AppHeader";
import { Backdrop } from "@/components/Backdrop";
import {
  ApiError,
  getProfile,
  updateProfile,
  updateOrgProfile,
  type ProfileOrg,
  type ProfileUser,
} from "@/lib/api-client";

export default function ProfilePage() {
  const { user, loading: authLoading } = useSession();
  const router = useRouter();

  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null);
  const [org, setOrg] = useState<ProfileOrg | null>(null);

  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");
  const [userSaving, setUserSaving] = useState(false);
  const [userSavedAt, setUserSavedAt] = useState<number | null>(null);
  const [userError, setUserError] = useState<string | null>(null);

  const [orgDescription, setOrgDescription] = useState("");
  const [orgPhone, setOrgPhone] = useState("");
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgSavedAt, setOrgSavedAt] = useState<number | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);

  const [, startTransition] = useTransition();

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/sign-in?callbackUrl=/profile"); return; }

    getProfile()
      .then(({ user: u, org: o }) => {
        setProfileUser(u);
        setBio(u.bio ?? "");
        setPhone(u.phone ?? "");
        if (o) {
          setOrg(o);
          setOrgDescription(o.description ?? "");
          setOrgPhone(o.phone ?? "");
        }
      })
      .catch(() => router.push("/sign-in"));
  }, [user, authLoading, router]);

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setUserError(null);
    setUserSaving(true);
    try {
      const { user: updated } = await updateProfile({
        bio: bio.trim() || null,
        phone: phone.trim() || null,
      });
      setProfileUser(updated);
      setUserSavedAt(Date.now());
      startTransition(() => router.refresh());
    } catch (err) {
      setUserError(
        err instanceof ApiError ? err.message : "Could not save your profile.",
      );
    } finally {
      setUserSaving(false);
    }
  }

  async function onSaveOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!org) return;
    setOrgError(null);
    setOrgSaving(true);
    try {
      await updateOrgProfile(org.id, {
        description: orgDescription.trim() || null,
        phone: orgPhone.trim() || null,
      });
      setOrgSavedAt(Date.now());
    } catch (err) {
      setOrgError(
        err instanceof ApiError ? err.message : "Could not save organisation details.",
      );
    } finally {
      setOrgSaving(false);
    }
  }

  if (authLoading || (user && !profileUser)) {
    return (
      <main className="relative mx-auto flex min-h-screen max-w-md items-center justify-center">
        <Backdrop />
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-solar-green border-t-transparent" />
      </main>
    );
  }

  if (!profileUser) return null;

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-7">
      <Backdrop />
      <AppHeader
        back={{ href: "/", label: "Topics" }}
        username={profileUser.email}
      />

      <section className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-solar-cream">Your profile</h1>
        <p className="text-sm text-solar-sage/70">
          Add a short bio and contact number so others know how to reach you.
        </p>
      </section>

      <form
        onSubmit={onSaveProfile}
        className="flex flex-col gap-5 rounded-field border border-solar-leafmd bg-solar-panel/60 p-6"
      >
        <label className="flex flex-col gap-2 text-sm uppercase tracking-wide text-solar-sage">
          Email
          <span className="rounded-field border border-solar-leafmd/40 bg-solar-field/30 px-4 py-3 text-base normal-case tracking-normal text-solar-sage/60">
            {profileUser.email}
          </span>
        </label>

        <label className="flex flex-col gap-2 text-sm uppercase tracking-wide text-solar-sage">
          Bio
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="Tell others a bit about yourself…"
            className="w-full resize-none rounded-field border-2 border-solar-green/40 bg-solar-field/50 px-4 py-3 text-base normal-case tracking-normal text-solar-sage placeholder:text-solar-sage/40 focus:border-solar-green focus:outline-none"
          />
          <span className="text-right text-xs normal-case tracking-normal text-solar-sage/50">
            {bio.length}/300
          </span>
        </label>

        <label className="flex flex-col gap-2 text-sm uppercase tracking-wide text-solar-sage">
          Contact number
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={30}
            placeholder="+1 555 000 0000"
            className="w-full rounded-field border-2 border-solar-green/40 bg-solar-field/50 px-4 py-3 text-base normal-case tracking-normal text-solar-sage placeholder:text-solar-sage/40 focus:border-solar-green focus:outline-none"
          />
        </label>

        {userError && (
          <p className="rounded-field bg-solar-danger/15 px-3 py-2 text-sm text-red-200">
            {userError}
          </p>
        )}
        {userSavedAt && !userError && (
          <p className="rounded-field bg-solar-green/15 px-3 py-2 text-sm text-solar-sage ring-1 ring-solar-green/40">
            Profile saved.
          </p>
        )}

        <button
          type="submit"
          disabled={userSaving}
          className="self-start rounded-full bg-solar-green px-5 py-2.5 text-sm font-bold text-solar-cream hover:bg-solar-moss disabled:opacity-60"
        >
          {userSaving ? "Saving…" : "Save profile"}
        </button>
      </form>

      {org && (
        <>
          <section className="flex flex-col gap-1">
            <h2 className="text-xl font-bold text-solar-cream">
              Organisation — {org.name}
            </h2>
            <p className="text-sm text-solar-sage/70">
              Update your organisation&apos;s public description and contact number.
            </p>
          </section>

          <form
            onSubmit={onSaveOrg}
            className="flex flex-col gap-5 rounded-field border border-solar-leafmd bg-solar-panel/60 p-6"
          >
            <label className="flex flex-col gap-2 text-sm uppercase tracking-wide text-solar-sage">
              Description
              <textarea
                value={orgDescription}
                onChange={(e) => setOrgDescription(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="What does your organisation do?"
                className="w-full resize-none rounded-field border-2 border-solar-green/40 bg-solar-field/50 px-4 py-3 text-base normal-case tracking-normal text-solar-sage placeholder:text-solar-sage/40 focus:border-solar-green focus:outline-none"
              />
              <span className="text-right text-xs normal-case tracking-normal text-solar-sage/50">
                {orgDescription.length}/500
              </span>
            </label>

            <label className="flex flex-col gap-2 text-sm uppercase tracking-wide text-solar-sage">
              Contact number
              <input
                type="tel"
                value={orgPhone}
                onChange={(e) => setOrgPhone(e.target.value)}
                maxLength={30}
                placeholder="+1 555 000 0000"
                className="w-full rounded-field border-2 border-solar-green/40 bg-solar-field/50 px-4 py-3 text-base normal-case tracking-normal text-solar-sage placeholder:text-solar-sage/40 focus:border-solar-green focus:outline-none"
              />
            </label>

            {orgError && (
              <p className="rounded-field bg-solar-danger/15 px-3 py-2 text-sm text-red-200">
                {orgError}
              </p>
            )}
            {orgSavedAt && !orgError && (
              <p className="rounded-field bg-solar-green/15 px-3 py-2 text-sm text-solar-sage ring-1 ring-solar-green/40">
                Organisation details saved.
              </p>
            )}

            <button
              type="submit"
              disabled={orgSaving}
              className="self-start rounded-full bg-solar-green px-5 py-2.5 text-sm font-bold text-solar-cream hover:bg-solar-moss disabled:opacity-60"
            >
              {orgSaving ? "Saving…" : "Save organisation"}
            </button>
          </form>
        </>
      )}
    </main>
  );
}
