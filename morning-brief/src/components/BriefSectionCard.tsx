import type { BriefSection } from "@/lib/types";
import { SECTION_ACCENT } from "@/lib/types";
import { RevealCard } from "./RevealCard";
import { DateBadge } from "./DateBadge";
import { BulletList, ActionList } from "./ActionList";
import { InsightBar } from "./InsightBar";
import { StatChip } from "./StatChip";
import { ImageFigGrid } from "./ImageFig";

export function BriefSectionCard({ section, date }: { section: BriefSection; date: string }) {
  const accent = SECTION_ACCENT[section.id] ?? "#c9a227";

  return (
    <RevealCard id={`section-${section.id}`} accent={accent}>
      <header className="mb-card-head">
        <div className="mb-head-left">
          <span className="mb-sec-num" style={{ "--sec-accent": accent } as React.CSSProperties}>
            {section.id}
          </span>
          <div>
            <h2>{section.title}</h2>
            <p className="mb-subtitle">{section.subtitle}</p>
          </div>
        </div>
        <DateBadge date={date} />
      </header>

      <ImageFigGrid images={section.images} />

      {section.stats?.length > 0 && (
        <div className="mb-stats-row">
          {section.stats.map((s, i) => (
            <StatChip stat={s} key={i} />
          ))}
        </div>
      )}

      <div className="mb-box-grid mb-box-grid-3">
        <div className="mb-box">
          <h3>สรุปสั้น</h3>
          <BulletList items={section.summary} />
        </div>
        <div className="mb-box">
          <h3>แปลความ</h3>
          <p className="mb-interp">{section.interpretation}</p>
        </div>
        <div className="mb-box">
          <h3>Action วันนี้</h3>
          <ActionList items={section.actionToday} />
        </div>
      </div>

      <InsightBar text={section.insight} />
    </RevealCard>
  );
}
