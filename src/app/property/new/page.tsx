"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewPropertyPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [glaSqft, setGlaSqft] = useState("");
  const [image, setImage] = useState<{
    dataUrl: string;
    width: number;
    height: number;
    fileName: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () =>
        setImage({
          dataUrl,
          width: img.naturalWidth,
          height: img.naturalHeight,
          fileName: file.name,
        });
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Please enter a property name.");
    if (!image) return setError("Please upload a site plan image.");
    setSaving(true);
    try {
      const res = await fetch("/api/property", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          address,
          city,
          glaSqft,
          sitePlanImage: image.dataUrl,
          imageWidth: image.width,
          imageHeight: image.height,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Create failed");
      const property = await res.json();
      // Go straight to the editor to start tagging units.
      router.push(`/property/${property.slug}/admin`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 11px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "inherit",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    margin: "14px 0 4px",
    display: "block",
  };

  return (
    <main className="container" style={{ maxWidth: 760 }}>
      <div className="prop-hero">
        <h1>Add a Property</h1>
        <p className="addr">
          Create a property, then tag its units on the site plan.
        </p>
      </div>

      <form onSubmit={submit} className="siteplan-box" style={{ padding: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Property name *</label>
            <input
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Festival at Riva"
              autoFocus
            />
          </div>
          <div>
            <label style={labelStyle}>Address</label>
            <input
              style={inputStyle}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 2551 Riva Rd"
            />
          </div>
          <div>
            <label style={labelStyle}>City / State / ZIP</label>
            <input
              style={inputStyle}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Annapolis, MD 21401"
            />
          </div>
          <div>
            <label style={labelStyle}>Total GLA (SF)</label>
            <input
              style={inputStyle}
              type="number"
              value={glaSqft}
              onChange={(e) => setGlaSqft(e.target.value)}
              placeholder="e.g. 167593"
            />
          </div>
        </div>

        <label style={labelStyle}>Site plan image *</label>
        <label
          className="btn"
          style={{ display: "inline-flex", marginBottom: 12 }}
        >
          {image ? "Choose a different image" : "Upload site plan"}
          <input
            type="file"
            accept="image/*"
            onChange={onUpload}
            style={{ display: "none" }}
          />
        </label>

        {image && (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 8,
              overflow: "hidden",
              marginBottom: 8,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.dataUrl}
              alt="site plan preview"
              style={{ width: "100%", display: "block" }}
            />
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                padding: "6px 10px",
              }}
            >
              {image.fileName} — {image.width}×{image.height}px
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              background: "#fdedeb",
              border: "1px solid #f0c8c4",
              color: "#b3261e",
              padding: "10px 14px",
              borderRadius: 8,
              margin: "12px 0",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        <div className="btn-row" style={{ marginTop: 18 }}>
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create property"}
          </button>
          <Link className="btn" href="/">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
