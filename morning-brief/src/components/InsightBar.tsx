import { splitHighlight } from "@/lib/format";

export function InsightBar({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="mb-insight-bar">
      {splitHighlight(text).map((part, i) =>
        typeof part === "string" ? (
          <span key={i}>{part}</span>
        ) : (
          <b className="mb-hl" key={i}>
            {part.hl}
          </b>
        )
      )}
    </div>
  );
}
