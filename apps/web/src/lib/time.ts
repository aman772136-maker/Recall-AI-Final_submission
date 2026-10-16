import type { Conversation } from "@recallai/shared-types";

export type HistoryGroup = "Today" | "Previous 7 days" | "Older";

export function groupByRecency(
  conversations: Conversation[],
): Array<{ label: HistoryGroup; items: Conversation[] }> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const sevenDaysAgo = startOfToday.getTime() - 7 * 864e5;

  const buckets: Record<HistoryGroup, Conversation[]> = {
    Today: [],
    "Previous 7 days": [],
    Older: [],
  };

  for (const c of conversations) {
    const t = new Date(c.updatedAt).getTime();
    if (Number.isNaN(t)) {
      buckets.Older.push(c);
    } else if (t >= startOfToday.getTime()) {
      buckets.Today.push(c);
    } else if (t >= sevenDaysAgo) {
      buckets["Previous 7 days"].push(c);
    } else {
      buckets.Older.push(c);
    }
  }

  return (Object.keys(buckets) as HistoryGroup[])
    .map((label) => ({ label, items: buckets[label] }))
    .filter((g) => g.items.length > 0);
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}