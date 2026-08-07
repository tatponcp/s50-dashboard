"use client";

import { useEffect, useRef, useState } from "react";
import type { Stat } from "@/lib/types";

function statDirClass(stat: Stat): string {
  if (stat.dir === "pos") return " is-pos";
  if (stat.dir === "neg") return " is-neg";
  if (stat.dir) return "";
  const v = String(stat.value || "").trim();
  if (/^\+/.test(v)) return " is-pos";
  if (/^[-−]/.test(v)) return " is-neg";
  return "";
}

// พอร์ตมาจาก shared/render-core.js animateStats() — นับตัวเลขขึ้นจาก 0 ถึงค่าจริง
// ตอนเลื่อนเข้ามาในจอ หา "ตัวเลขตัวแรก" ในสตริงแล้วแอนิเมตเฉพาะส่วนนั้น ส่วนที่เหลือ
// (หน่วย/เปอร์เซ็นต์ในวงเล็บ) คงเดิม จบด้วยค่าจริงเป๊ะเสมอกันความคลาดเคลื่อนจากการปัดเศษ
export function StatChip({ stat }: { stat: Stat }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(stat.value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || !("IntersectionObserver" in window)) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          io.unobserve(entry.target);

          const final = stat.value;
          const m = /-?[\d,]+\.?\d*/.exec(final);
          if (!m) return;
          const numStr = m[0];
          const target = parseFloat(numStr.replace(/,/g, ""));
          if (!isFinite(target)) return;
          const hasComma = numStr.includes(",");
          const decimals = (numStr.split(".")[1] || "").length;
          const prefix = final.slice(0, m.index);
          const suffix = final.slice(m.index + numStr.length);
          const duration = 900;
          const t0 = performance.now();

          function frame(t: number) {
            const p = Math.min(1, (t - t0) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            const val = target * eased;
            const formatted = hasComma
              ? val.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
              : val.toFixed(decimals);
            setDisplay(prefix + formatted + suffix);
            if (p < 1) requestAnimationFrame(frame);
            else setDisplay(final);
          }
          requestAnimationFrame(frame);
        });
      },
      { threshold: 0.1 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [stat.value]);

  return (
    <div className="mb-stat-chip">
      <span className="mb-stat-label">{stat.label}</span>
      <span className={`mb-stat-value${statDirClass(stat)}`} ref={ref}>
        {display}
      </span>
    </div>
  );
}
