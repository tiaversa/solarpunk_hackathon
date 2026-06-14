import { TOPICS } from "@/lib/missionMatrix";
import ProgressPageClient from "./ProgressPageClient";

export function generateStaticParams() {
  return TOPICS.map(({ id }) => ({ topic: id }));
}

export default function ProgressPage() {
  return <ProgressPageClient />;
}
