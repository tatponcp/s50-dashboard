const THAI_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

// "2026-08-06" -> "06 ส.ค. 2569" (พ.ศ.) — พอร์ตจาก shared/render-core.js formatThaiDate()
export function formatThaiDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return iso || "";
  return `${m[3]} ${THAI_MONTHS[Number(m[2]) - 1]} ${Number(m[1]) + 543}`;
}

// แปลงข้อความที่มี **คำ** ล้อมไว้ ให้เป็นชิ้นส่วนสำหรับ render เป็น <b class="mb-hl"> —
// คืนค่าเป็น array ของ string/JSX ไม่ใช้ dangerouslySetInnerHTML
export function splitHighlight(text: string): (string | { hl: string })[] {
  if (!text) return [];
  const parts: (string | { hl: string })[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push({ hl: match[1] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
