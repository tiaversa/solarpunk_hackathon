import OrgPageClient from "./OrgPageClient";

// Org IDs are runtime UUIDs — we can't enumerate them at build time.
// A placeholder entry satisfies Next.js static-export requirements while
// keeping all real navigation client-side (router.push never triggers a
// file lookup, so any orgId works after the initial page load).
export function generateStaticParams() {
  return [{ orgId: "_" }];
}

export const dynamicParams = false;

export default function OrgDashboardPage() {
  return <OrgPageClient />;
}
