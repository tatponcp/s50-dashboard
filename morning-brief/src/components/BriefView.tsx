import type { Brief } from "@/lib/types";
import { LightboxProvider } from "./Lightbox";
import { OverviewCard } from "./OverviewCard";
import { BriefSectionCard } from "./BriefSectionCard";
import { formatThaiDate } from "@/lib/format";

// Component หลักที่ทั้งหน้า client (public) และหน้า preview (ic) ใช้ร่วมกัน
// เพื่อให้สิ่งที่ IC เห็นตอน preview ตรงกับสิ่งที่ลูกค้าเห็นจริง — พอร์ตมาจาก
// เจตนาเดียวกับ shared/render-core.js (renderOverview + renderSection) ของระบบเดิม
export function BriefView({ brief }: { brief: Brief }) {
  return (
    <LightboxProvider>
      <header className="mb-topbar">
        <div className="mb-brand">
          <span className="mb-brand-mark">S</span>
          <div>
            Morning Brief
            <div className="mb-brand-sub">S50 Dashboard</div>
          </div>
        </div>
        <span className="mb-topbar-badge mb-mono">{formatThaiDate(brief.date)}</span>
      </header>

      <main className="mb-main">
        <OverviewCard overview={brief.overview} date={brief.date} />
        <hr className="mb-rule" />

        {brief.sections.map((sec) => (
          <BriefSectionCard section={sec} date={brief.date} key={sec.id} />
        ))}

        <footer className="mb-footer">
          Morning Brief เป็นการสรุปมุมมองตลาดจากทีมงานเพื่อประกอบการตัดสินใจ ไม่ใช่คำแนะนำการลงทุน
        </footer>
      </main>
    </LightboxProvider>
  );
}
