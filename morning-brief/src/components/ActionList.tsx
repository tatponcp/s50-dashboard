import type { LabelValue } from "@/lib/types";

export function ActionList({ items }: { items: LabelValue[] }) {
  if (!items?.length) return null;
  return (
    <dl className="mb-actionlist">
      {items.map((it, i) => (
        <div className="mb-action-row" key={i}>
          <dt>{it.label}</dt>
          <dd>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function BulletList({ items }: { items: string[] }) {
  if (!items?.length) return null;
  return (
    <ul className="mb-bullets">
      {items.map((t, i) => (
        <li key={i}>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}
