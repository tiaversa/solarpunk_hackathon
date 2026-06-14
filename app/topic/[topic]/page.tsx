import { TOPICS } from "@/lib/missionMatrix";
import TopicPageClient from "./TopicPageClient";

export function generateStaticParams() {
  return TOPICS.map(({ id }) => ({ topic: id }));
}

export default function TopicPage() {
  return <TopicPageClient />;
}
