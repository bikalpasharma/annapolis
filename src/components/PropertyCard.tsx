"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export interface PropertyCardData {
  slug: string;
  name: string;
  address: string;
  city: string;
  image: string;
  unitCount: number;
  available: number;
}

export default function PropertyCard({ p }: { p: PropertyCardData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete “${p.name}”? This cannot be undone.`)) return;
    setBusy(true);
    await fetch(`/api/property/${p.slug}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <Link
      href={`/property/${p.slug}`}
      className="prop-card"
      style={{ position: "relative", opacity: busy ? 0.5 : 1 }}
    >
      <button
        onClick={onDelete}
        disabled={busy}
        aria-label={`Delete ${p.name}`}
        title="Delete property"
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 2,
          width: 30,
          height: 30,
          borderRadius: 8,
          border: "none",
          background: "rgba(14,44,75,0.72)",
          color: "#fff",
          fontSize: 16,
          lineHeight: 1,
        }}
      >
        ×
      </button>
      <div className="thumb">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.image} alt={p.name} />
      </div>
      <div className="body">
        <h3>{p.name}</h3>
        <p>
          {[p.address, p.city].filter(Boolean).join(", ")}
        </p>
        <p style={{ marginTop: 8 }}>
          <span className="pill">{p.unitCount} units</span>{" "}
          {p.available > 0 && (
            <span className="pill warn">{p.available} available</span>
          )}
        </p>
      </div>
    </Link>
  );
}
