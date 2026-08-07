"use client";

import { useLightbox } from "./Lightbox";
import type { ImageRef } from "@/lib/types";

export function ImageFigGrid({ images }: { images: ImageRef[] }) {
  const { open } = useLightbox();

  if (!images.length) {
    return <div className="mb-img-placeholder">ยังไม่มีภาพแนบ</div>;
  }

  return (
    <div className="mb-img-grid">
      {images.map((img, i) => (
        <figure className="mb-img-fig" key={i}>
          {/* ภาพจาก IC เอง ใช้ <img> ธรรมดาแทน next/image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img.src}
            alt={img.label || ""}
            onClick={() => open(img.src, img.label || "")}
          />
          {img.label && <figcaption>{img.label}</figcaption>}
        </figure>
      ))}
    </div>
  );
}
