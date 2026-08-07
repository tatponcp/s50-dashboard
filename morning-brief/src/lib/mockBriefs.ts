// ข้อมูลจำลอง Phase 1 — คัดลอกจาก client/data/2026-08-06.json ของระบบเดิม
// เพื่อพิสูจน์ว่า component ที่ port มาแสดงผลถูกต้อง ก่อนต่อ Supabase จริงใน Phase 2
import type { Brief } from './types';

const brief20260806: Brief = {
  date: '2026-08-06',
  overview: {
    subtitle: 'อ่าน 6 ชุดข้อมูล แล้วตลาดกำลังบอกอะไร (ตัวอย่างข้อมูลทดสอบ)',
    bigPicture: [
      { title: 'S50 / หุ้นใหญ่', text: 'ราคาย่อในกรอบ ยังไม่มีแรงขายใหม่เข้าเพิ่ม', iconType: 'chart-up' },
      { title: 'Gold', text: 'ทรงตัวรอปัจจัยมหภาคสัปดาห์หน้า', iconType: 'globe' },
      { title: 'USD Futures', text: 'รอฐานก่อนเลือกทาง', iconType: 'dollar' },
    ],
    legends: {},
    sectionsPreview: [],
    dataSignals: ['OI สะสมฝั่ง Call ยังนำ Put อยู่', 'แรงขายต่างชาติชะลอตัวจากสัปดาห์ก่อน'],
    actionToday: [
      { label: 'เด่น', value: 'S50 Futures / หุ้น SET50', icon: 'target' },
      { label: 'รอง', value: 'Gold', icon: 'globe' },
    ],
    insight: 'ตลาดยังอยู่ในโหมด **sideways สะสมแรง** รอ catalyst ถัดไป',
  },
  sections: [
    {
      id: 1,
      title: 'S50 Futures + Open Interest',
      subtitle: 'ดูว่าราคาย่อด้วยแรงขายธรรมดา หรือมีแรงกดดันใหม่เพิ่ม',
      images: [],
      stats: [
        { label: 'Close', value: '1,076.30' },
        { label: 'Change', value: '-5.20 (-0.48%)' },
      ],
      history: [{ date: '2026-08-05', s50u26Close: '1080.5', s50u26OI: '568,655' }],
      historyColumns: [
        { key: 'date', label: 'วันที่' },
        { key: 's50u26Close', label: 'U26 Close' },
        { key: 's50u26OI', label: 'U26 OI' },
      ],
      summary: ['OI ฝั่ง Call ยังหนาแน่นกว่า Put', 'ราคาทรงตัวเหนือแนวรับสำคัญ'],
      interpretation: 'นี่คือข้อมูลตัวอย่างสำหรับทดสอบหน้า Client — ยังไม่ใช่ข้อมูลจริง',
      actionToday: [{ label: 'สินค้าที่เด่น', value: 'S50U26 / S50Z26', icon: 'target' }],
      insight: 'จับตาโซน **1,080** เป็นแนวต้านสำคัญของสัปดาห์นี้',
    },
    {
      id: 2,
      title: 'สะสม Long/Short ต่างชาติ + กองทุน',
      subtitle: 'ดูแรงซื้อ/ขายสะสมของกลุ่มที่มีอิทธิพลต่อทิศทางตลาด',
      images: [],
      stats: [],
      history: [],
      historyColumns: null,
      summary: ['ต่างชาติยังอยู่ฝั่ง Short สะสม', 'กองทุนในประเทศยังช่วยพยุงฝั่ง Long'],
      interpretation: 'ตลาดยังพอรีบาวด์ได้เพราะกองทุนช่วยประคอง แต่ต่างชาติยังไม่กลับมาหนุนเต็มตัว',
      actionToday: [{ label: 'มุมมอง', value: 'รีบาวด์ได้ แต่ระวัง', icon: 'target' }],
      insight: 'เงินกองทุนช่วยประคอง แต่ต่างชาติยังไม่ **confirm** ขาขึ้นเต็มตัว',
    },
  ],
};

export const MOCK_DATES = [brief20260806.date];

export function getMockBrief(date: string): Brief | undefined {
  return date === brief20260806.date ? brief20260806 : undefined;
}

export function getLatestMockDate(): string {
  return MOCK_DATES[0];
}
