"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Backdrop } from "@/components/Backdrop";

export default function NotFound() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md items-center justify-center">
      <Backdrop />
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-solar-green border-t-transparent" />
    </main>
  );
}
