"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";

interface LightboxContextValue {
  open: (src: string, alt: string) => void;
}

const LightboxContext = createContext<LightboxContextValue | null>(null);

export function useLightbox() {
  const ctx = useContext(LightboxContext);
  if (!ctx) throw new Error("useLightbox ต้องอยู่ภายใน <LightboxProvider>");
  return ctx;
}

// พอร์ตมาจาก shared/render-core.js ensureLightbox() — คลิกภาพเพื่อดูขยายเต็มจอ, Esc/คลิกนอกภาพเพื่อปิด
export function LightboxProvider({ children }: { children: React.ReactNode }) {
  const [image, setImage] = useState<{ src: string; alt: string } | null>(null);

  const open = useCallback((src: string, alt: string) => setImage({ src, alt }), []);
  const close = useCallback(() => setImage(null), []);

  useEffect(() => {
    if (!image) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [image, close]);

  return (
    <LightboxContext.Provider value={{ open }}>
      {children}
      <div
        className={`mb-lightbox${image ? " is-open" : ""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <button type="button" className="mb-lightbox-close" aria-label="ปิดภาพขยาย" onClick={close}>
          ✕
        </button>
        {/* ภาพจาก IC เอง (ไม่ใช่โดเมนที่รู้จักล่วงหน้า) ใช้ <img> ธรรมดาแทน next/image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image && <img src={image.src} alt={image.alt} />}
      </div>
    </LightboxContext.Provider>
  );
}
