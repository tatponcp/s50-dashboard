import { getMockBrief, getLatestMockDate } from "@/lib/mockBriefs";
import { BriefView } from "@/components/BriefView";

// Phase 1: แค่พิสูจน์ว่า component เดียวกับหน้า client render ได้ตรงกัน (WYSIWYG)
// ยังไม่มีฟอร์มกรอกข้อมูล/ปุ่ม Publish จริง — มาใน Phase 3 พร้อมรื้อจาก
// internal/js/editor.js + internal/js/rules.js ของระบบเดิม
export default function EditPreview() {
  const brief = getMockBrief(getLatestMockDate())!;

  return (
    <>
      <div
        style={{
          background: "var(--mb-accent-gold-bg)",
          borderBottom: "1px solid var(--mb-border)",
          padding: "10px 24px",
          fontSize: "0.8rem",
          textAlign: "center",
          color: "var(--mb-text-secondary)",
        }}
      >
        🚧 Phase 1 — พรีวิวอย่างเดียว (ยังไม่มีฟอร์มกรอก/ปุ่ม Publish จริง มาใน Phase 3)
      </div>
      <BriefView brief={brief} />
    </>
  );
}
