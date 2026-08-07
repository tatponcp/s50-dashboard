import { formatThaiDate } from "@/lib/format";

export function DateBadge({ date }: { date: string }) {
  if (!date) return null;
  return (
    <span className="mb-date-badge">
      <span className="mb-live-dot" aria-hidden="true" />
      ข้อมูล ณ <b>{formatThaiDate(date)}</b>
    </span>
  );
}
