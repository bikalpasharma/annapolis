"use client";

import { useState } from "react";
import {
  Property,
  Unit,
  UnitStatus,
  STATUS_LABEL,
  displayName,
  displaySqft,
  displayStatus,
} from "@/lib/types";

const FILL: Record<UnitStatus, string> = {
  occupied: "#24567f",
  vacant: "#f5821f",
  coming_soon: "#3f9d6d",
};

export default function SitePlanViewer({ property }: { property: Property }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const placed = property.units.filter((u) => u.polygon && u.polygon.length >= 3);
  const selected = property.units.find((u) => u.id === selectedId) ?? null;

  return (
    <div className="siteplan-box">
      <div className="box-head">
        <h2>Site Plan</h2>
        <div className="legend">
          <span>
            <span className="dot" style={{ background: FILL.occupied }} />
            Leased
          </span>
          <span>
            <span className="dot" style={{ background: FILL.vacant }} />
            Available
          </span>
          <span>
            <span className="dot" style={{ background: FILL.coming_soon }} />
            Coming soon
          </span>
        </div>
      </div>

      <div className="plan-layout">
        <div className="plan-stage">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="plan-img"
            src={property.sitePlanImage}
            alt={`${property.name} site plan`}
          />
          <svg
            className="plan-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {placed.map((u) => {
              const status = displayStatus(u);
              const isActive = u.id === selectedId || u.id === hoverId;
              return (
                <polygon
                  key={u.id}
                  points={u.polygon!.map((p) => p.join(",")).join(" ")}
                  fill={FILL[status]}
                  fillOpacity={isActive ? 0.68 : status === "vacant" ? 0.42 : 0.32}
                  stroke={isActive ? "#ffffff" : FILL[status]}
                  strokeWidth={isActive ? 0.5 : 0.25}
                  vectorEffect="non-scaling-stroke"
                  onClick={() => setSelectedId(u.id)}
                  onMouseEnter={() => setHoverId(u.id)}
                  onMouseLeave={() => setHoverId(null)}
                >
                  <title>
                    {displayName(u)} — {displaySqft(u).toLocaleString()} SF
                  </title>
                </polygon>
              );
            })}
          </svg>
        </div>

        <div className="detail-panel">
          {selected ? (
            <UnitDetail unit={selected} onClose={() => setSelectedId(null)} />
          ) : (
            <p className="empty">
              Click a unit on the site plan to see the tenant, square footage,
              and suite number.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function UnitDetail({ unit, onClose }: { unit: Unit; onClose: () => void }) {
  const status = displayStatus(unit);
  const available = status === "vacant";
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <h3 className="detail-name">
          {available ? "Available Space" : displayName(unit)}
        </h3>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            border: "none",
            background: "transparent",
            fontSize: 20,
            color: "var(--text-muted)",
          }}
        >
          ×
        </button>
      </div>
      <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>

      <div className="detail-meta">
        <div className="row">
          <span className="k">Suite</span>
          <span className="v">{unit.mri.suite}</span>
        </div>
        <div className="row">
          <span className="k">Square feet</span>
          <span className="v">{displaySqft(unit).toLocaleString()} SF</span>
        </div>
        {!available && unit.override.category && (
          <div className="row">
            <span className="k">Category</span>
            <span className="v">{unit.override.category}</span>
          </div>
        )}
      </div>

      {available ? (
        <a className="cta" href="mailto:arabin@mcbrealestate.com">
          Inquire about this space
        </a>
      ) : unit.override.website ? (
        <a
          className="cta"
          href={unit.override.website}
          target="_blank"
          rel="noreferrer"
        >
          Visit tenant website
        </a>
      ) : null}
    </div>
  );
}
