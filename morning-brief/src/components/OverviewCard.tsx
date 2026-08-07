import type { Overview } from "@/lib/types";
import { RevealCard } from "./RevealCard";
import { DateBadge } from "./DateBadge";
import { BulletList, ActionList } from "./ActionList";
import { InsightBar } from "./InsightBar";

export function OverviewCard({ overview, date }: { overview: Overview; date: string }) {
  return (
    <RevealCard id="overview" overview>
      <header className="mb-card-head">
        <div className="mb-head-left">
          <div>
            <h2>สรุปภาพรวม Action วันนี้</h2>
            <p className="mb-subtitle">{overview.subtitle}</p>
          </div>
        </div>
        <DateBadge date={date} />
      </header>

      {overview.bigPicture?.length > 0 && (
        <div className="mb-bp-grid">
          {overview.bigPicture.map((b, i) => (
            <div className="mb-bp-card" key={i}>
              <div className="mb-bp-title">{b.title}</div>
              <div className="mb-bp-text">{b.text}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-box-grid mb-box-grid-2">
        <div className="mb-box">
          <h3>สิ่งที่ Data กำลังบอก</h3>
          <BulletList items={overview.dataSignals} />
        </div>
        <div className="mb-box">
          <h3>Action วันนี้ (ภาพรวม)</h3>
          <ActionList items={overview.actionToday} />
        </div>
      </div>

      <InsightBar text={overview.insight} />
    </RevealCard>
  );
}
