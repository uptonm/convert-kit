"use client";

import { useEffect, useState } from "react";

const PAIRS = [
  ["EPUB", "PDF"],
  ["PNG", "WebP"],
  ["JSON", "CSV"],
  ["MP4", "MP3"],
  ["HEIC", "JPG"],
];

export function FormatMorph() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setI((n) => (n + 1) % PAIRS.length), 2400);
    return () => window.clearInterval(id);
  }, []);
  const [from, to] = PAIRS[i];
  return (
    <div className="ck-morph-stage" aria-hidden>
      <p
        key={`${from}-${to}`}
        className="ck-morph-word"
        style={{ animation: "ck-rise 0.6s ease both, ck-morph 2.4s ease-in-out both" }}
      >
        {from}
        <span className="mx-[0.12em] text-primary/40">→</span>
        {to}
      </p>
    </div>
  );
}
