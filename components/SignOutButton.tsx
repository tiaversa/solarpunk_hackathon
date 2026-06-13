"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className="text-sm font-medium text-leaf-700 underline underline-offset-2 hover:text-leaf-600"
    >
      Sign out
    </button>
  );
}
