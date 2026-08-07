// รูปทรงข้อมูล 1 วันของ Morning Brief — เหมือนกับ client/data/*.json เดิมทุกจุด
// (คง shape เดิมไว้ตั้งใจ เพื่อให้ import ข้อมูลเก่าเข้า Supabase ได้ตรงๆ ไม่ต้องแปลง)

export type IconType =
  | 'chart-up'
  | 'flow'
  | 'dollar'
  | 'target'
  | 'breadth'
  | 'globe'
  | 'bolt'
  | 'brain'
  | 'list'
  | 'overview';

export interface LabelValue {
  label: string;
  value: string;
  icon?: string;
}

export interface Stat {
  label: string;
  value: string;
  dir?: 'pos' | 'neg' | 'flat';
}

export interface BigPictureItem {
  title: string;
  text: string;
  iconType: IconType;
}

export interface ImageRef {
  label?: string;
  src: string;
}

export interface HistoryColumn {
  key: string;
  label: string;
}

export interface Overview {
  subtitle: string;
  bigPicture: BigPictureItem[];
  legends: Record<string, string>;
  sectionsPreview?: { id: number; title: string; legend: string }[];
  dataSignals: string[];
  actionToday: LabelValue[];
  insight: string;
}

export interface BriefSection {
  id: number;
  title: string;
  subtitle: string;
  images: ImageRef[];
  stats: Stat[];
  history: Record<string, string>[];
  historyColumns: HistoryColumn[] | null;
  summary: string[];
  interpretation: string;
  actionToday: LabelValue[];
  insight: string;
}

export interface Brief {
  date: string; // YYYY-MM-DD
  overview: Overview;
  sections: BriefSection[];
}

export const SECTION_ACCENT: Record<number, string> = {
  1: '#c9a227', // gold
  2: '#fb7185', // red/pink
  3: '#4f9ecf', // cyan
  4: '#c9a227', // gold
  5: '#8c7de0', // purple
  6: '#2fa890', // green
};
