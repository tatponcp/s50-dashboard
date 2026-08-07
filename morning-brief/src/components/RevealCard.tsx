"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

// พอร์ตมาจาก shared/render-core.js enhanceCard() — การ์ดค่อยๆ ปรากฏตอนเลื่อนจอเข้ามาในจอ
export function RevealCard({
  id,
  accent,
  overview,
  children,
}: {
  id?: string;
  accent?: string;
  overview?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // prefers-reduced-motion ไม่ต้องสั่ง setState ที่นี่ — globals.css มี
    // media query บังคับ opacity:1/transform:none ให้อยู่แล้วโดยไม่สนคลาส mb-revealed
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setRevealed(true);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const style = accent ? ({ "--sec-accent": accent } as CSSProperties) : undefined;
  const className = `mb-card${overview ? " mb-card-overview" : ""}${revealed ? " mb-revealed" : ""}`;

  return (
    <section id={id} className={className} style={style} ref={ref as React.RefObject<HTMLElement>}>
      {children}
    </section>
  );
}
