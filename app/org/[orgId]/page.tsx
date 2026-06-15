import { Suspense } from "react";
import OrgPageClient from "./OrgPageClient";
import { Backdrop } from "@/components/Backdrop";

// Org IDs are runtime UUIDs — can't enumerate them at build time.
// We navigate to /org/_/?id=<realId> so the RSC payload for the pre-rendered
// "/_" route always resolves, and OrgPageClient reads the real id from the
// query string instead of the URL segment.
export function generateStaticParams() {
  return [{ orgId: "_" }];
}

export const dynamicParams = false;

export default function OrgDashboardPage() {
  return (
    <Suspense fallback={
      <main className="relative mx-auto flex min-h-screen max-w-md items-center justify-center">
        <Backdrop />
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-solar-green border-t-transparent" />
      </main>
    }>
      <OrgPageClient />
    </Suspense>
  );
}
