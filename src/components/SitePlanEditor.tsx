"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import {
  Property,
  Unit,
  MriRecord,
  UnitStatus,
  Point,
  STATUS_LABEL,
  displayName,
  displaySqft,
  displayStatus,
  hasOverride,
  isManual,
} from "@/lib/types";

const FILL: Record<UnitStatus, string> = {
  occupied: "#24567f",
  vacant: "#f5821f",
  coming_soon: "#3f9d6d",
};

type Mode = "idle" | "draw";

export default function SitePlanEditor({ initial }: { initial: Property }) {
  const [property, setProperty] = useState<Property>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [draft, setDraft] = useState<Point[]>([]);
  const [dragVertex, setDragVertex] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const selected = property.units.find((u) => u.id === selectedId) ?? null;

  const placedCount = property.units.filter((u) => u.polygon).length;

  // --- coordinate helper: mouse event -> [x%, y%] within the stage ----------
  const toPercent = useCallback((clientX: number, clientY: number): Point => {
    const rect = stageRef.current!.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return [
      Math.round(Math.min(100, Math.max(0, x)) * 10) / 10,
      Math.round(Math.min(100, Math.max(0, y)) * 10) / 10,
    ];
  }, []);

  // --- mutations ------------------------------------------------------------
  const updateUnit = useCallback((id: string, fn: (u: Unit) => Unit) => {
    setProperty((prev) => ({
      ...prev,
      units: prev.units.map((u) => (u.id === id ? fn(u) : u)),
    }));
    setDirty(true);
  }, []);

  const setOverride = (id: string, patch: Partial<Unit["override"]>) =>
    updateUnit(id, (u) => ({ ...u, override: { ...u.override, ...patch } }));

  const setCore = (id: string, patch: Partial<MriRecord>) =>
    updateUnit(id, (u) => ({ ...u, mri: { ...u.mri, ...patch } }));

  // --- add a brand-new space (not from MRI) ---------------------------------
  function addNewSpace() {
    if (mode === "draw") return;
    const id = `m${Date.now().toString(36)}`;
    const unit: Unit = {
      id,
      source: "manual",
      mri: { suite: "", tenantName: "New Space", sqft: 0, status: "vacant" },
      override: {},
      polygon: null,
    };
    setProperty((prev) => ({ ...prev, units: [...prev.units, unit] }));
    setDirty(true);
    setSelectedId(id);
    setMode("draw");
    setDraft([]);
    setToast("Trace the new space on the plan, click Finish, then fill in its details.");
  }

  function deleteSpace(id: string) {
    setProperty((prev) => ({
      ...prev,
      units: prev.units.filter((u) => u.id !== id),
    }));
    setDirty(true);
    if (selectedId === id) setSelectedId(null);
    if (mode === "draw") cancelDraw();
  }

  // --- drawing --------------------------------------------------------------
  function startDraw(id: string) {
    setSelectedId(id);
    setMode("draw");
    setDraft([]);
  }
  function finishDraw() {
    if (selected && draft.length >= 3) {
      updateUnit(selected.id, (u) => ({ ...u, polygon: draft }));
    }
    setMode("idle");
    setDraft([]);
  }
  function cancelDraw() {
    setMode("idle");
    setDraft([]);
  }

  function onStagePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (mode !== "draw") return;
    // ignore clicks that originate on a control handle
    setDraft((d) => [...d, toPercent(e.clientX, e.clientY)]);
  }

  // --- vertex dragging (edit an existing polygon) ---------------------------
  function onVertexDown(e: ReactPointerEvent, index: number) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragVertex(index);
  }
  function onStagePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragVertex === null || !selected?.polygon) return;
    const p = toPercent(e.clientX, e.clientY);
    updateUnit(selected.id, (u) => ({
      ...u,
      polygon: u.polygon!.map((pt, i) => (i === dragVertex ? p : pt)),
    }));
  }
  function onStagePointerUp() {
    setDragVertex(null);
  }

  function removeFromMap(id: string) {
    updateUnit(id, (u) => ({ ...u, polygon: null }));
    if (mode === "draw") cancelDraw();
  }

  // --- image upload ---------------------------------------------------------
  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        setProperty((prev) => ({
          ...prev,
          sitePlanImage: dataUrl,
          imageWidth: img.naturalWidth,
          imageHeight: img.naturalHeight,
        }));
        setDirty(true);
        setToast("New site plan loaded. Re-tag units, then Save.");
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  // --- save -----------------------------------------------------------------
  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/property/${property.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(property),
      });
      if (!res.ok) throw new Error(await res.text());
      setDirty(false);
      setToast("Saved. Public page now reflects these changes.");
    } catch (err) {
      setToast("Save failed: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const unplaced = useMemo(
    () => property.units.filter((u) => !u.polygon),
    [property.units],
  );

  return (
    <div>
      {/* toolbar */}
      <div
        className="btn-row"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div className="btn-row">
          <label className="btn">
            Upload site plan
            <input
              type="file"
              accept="image/*"
              onChange={onUpload}
              style={{ display: "none" }}
            />
          </label>
          <button
            className="btn orange"
            onClick={addNewSpace}
            disabled={mode === "draw"}
          >
            + Add new space
          </button>
          <Link className="btn" href={`/property/${property.slug}`}>
            View public page
          </Link>
        </div>
        <div className="btn-row" style={{ alignItems: "center" }}>
          {dirty && <span className="pill warn">Unsaved changes</span>}
          <button
            className="btn primary"
            onClick={save}
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {toast && (
        <div
          style={{
            background: "#eef7f1",
            border: "1px solid #cfe8da",
            color: "#256e4a",
            padding: "10px 14px",
            borderRadius: 8,
            marginBottom: 14,
            fontSize: 14,
          }}
        >
          {toast}
        </div>
      )}

      <div className="siteplan-box">
        <div className="box-head">
          <h2>
            {mode === "draw"
              ? `Drawing boundary for “${displayName(selected!)}” — click to add points`
              : "Click a unit to select it · drag its corners to adjust"}
          </h2>
          {mode === "draw" && (
            <div className="btn-row">
              <button
                className="btn orange"
                onClick={finishDraw}
                disabled={draft.length < 3}
              >
                Finish ({draft.length})
              </button>
              <button className="btn" onClick={cancelDraw}>
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className="plan-layout">
          <div
            className="plan-stage"
            ref={stageRef}
            onPointerDown={onStagePointerDown}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerUp}
            style={{ cursor: mode === "draw" ? "crosshair" : "default" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="plan-img"
              src={property.sitePlanImage}
              alt="site plan"
              draggable={false}
            />
            <svg className="plan-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
              {property.units
                .filter((u) => u.polygon && u.polygon.length >= 3)
                .map((u) => {
                  const status = displayStatus(u);
                  const isSel = u.id === selectedId;
                  return (
                    <polygon
                      key={u.id}
                      points={u.polygon!.map((p) => p.join(",")).join(" ")}
                      fill={FILL[status]}
                      fillOpacity={isSel ? 0.6 : 0.3}
                      stroke={isSel ? "#fff" : FILL[status]}
                      strokeWidth={isSel ? 0.6 : 0.3}
                      vectorEffect="non-scaling-stroke"
                      style={{ cursor: "pointer" }}
                      onClick={(e) => {
                        if (mode === "draw") return;
                        e.stopPropagation();
                        setSelectedId(u.id);
                      }}
                    />
                  );
                })}

              {/* draft polygon being drawn */}
              {mode === "draw" && draft.length > 0 && (
                <polyline
                  points={draft.map((p) => p.join(",")).join(" ")}
                  fill="rgba(245,130,31,0.25)"
                  stroke="#f5821f"
                  strokeWidth={0.5}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {mode === "draw" &&
                draft.map((p, i) => (
                  <circle
                    key={i}
                    cx={p[0]}
                    cy={p[1]}
                    r={0.7}
                    fill="#f5821f"
                    stroke="#fff"
                    strokeWidth={0.3}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}

              {/* editable vertex handles for the selected placed unit */}
              {mode === "idle" &&
                selected?.polygon?.map((p, i) => (
                  <circle
                    key={i}
                    cx={p[0]}
                    cy={p[1]}
                    r={0.9}
                    fill="#fff"
                    stroke={FILL[displayStatus(selected)]}
                    strokeWidth={0.5}
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: "grab" }}
                    onPointerDown={(e) => onVertexDown(e, i)}
                  />
                ))}
            </svg>
          </div>

          {/* right rail: units + editor */}
          <div className="detail-panel" style={{ padding: 0 }}>
            <UnitList
              property={property}
              selectedId={selectedId}
              onSelect={(id) => {
                if (mode === "draw") return;
                setSelectedId(id);
              }}
            />
          </div>
        </div>
      </div>

      {/* selected-unit editor */}
      {selected && (
        <div className="siteplan-box" style={{ marginTop: 18 }}>
          <div className="box-head">
            <h2>
              {isManual(selected) ? (
                <>
                  {displayName(selected)}{" "}
                  <span className="pill">new space</span>
                </>
              ) : (
                <>
                  Suite {selected.mri.suite} — {displayName(selected)}{" "}
                  {hasOverride(selected) && (
                    <span className="pill warn">overridden</span>
                  )}
                </>
              )}
            </h2>
            <div className="btn-row">
              <button
                className="btn orange"
                onClick={() => startDraw(selected.id)}
              >
                {selected.polygon ? "Redraw boundary" : "Draw boundary"}
              </button>
              {isManual(selected) ? (
                <button
                  className="btn danger"
                  onClick={() => deleteSpace(selected.id)}
                >
                  Delete space
                </button>
              ) : (
                selected.polygon && (
                  <button
                    className="btn danger"
                    onClick={() => removeFromMap(selected.id)}
                  >
                    Remove from map
                  </button>
                )
              )}
            </div>
          </div>
          <div style={{ padding: 20 }}>
            <OverrideForm
              unit={selected}
              onOverride={(patch) => setOverride(selected.id, patch)}
              onCore={(patch) => setCore(selected.id, patch)}
            />
          </div>
        </div>
      )}

      {unplaced.length > 0 && (
        <p style={{ marginTop: 14, fontSize: 13, color: "var(--text-muted)" }}>
          <strong>{unplaced.length}</strong> unit(s) not yet placed on the plan:{" "}
          {unplaced
            .map((u) => `${u.mri.suite ? `#${u.mri.suite} ` : ""}${displayName(u)}`)
            .join(", ")}
          . Select one above and click “Draw boundary”.
        </p>
      )}
      <p style={{ marginTop: 4, fontSize: 13, color: "var(--text-muted)" }}>
        {placedCount}/{property.units.length} units placed.
      </p>
    </div>
  );
}

function UnitList({
  property,
  selectedId,
  onSelect,
}: {
  property: Property;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ maxHeight: 560, overflowY: "auto" }}>
      {property.units.map((u) => {
        const status = displayStatus(u);
        const sel = u.id === selectedId;
        return (
          <button
            key={u.id}
            onClick={() => onSelect(u.id)}
            style={{
              display: "flex",
              width: "100%",
              textAlign: "left",
              gap: 10,
              alignItems: "center",
              padding: "10px 14px",
              border: "none",
              borderBottom: "1px solid var(--border)",
              background: sel ? "#eef2f7" : "transparent",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: FILL[status],
                flexShrink: 0,
              }}
            />
            <span style={{ flexShrink: 0, color: "var(--text-muted)", fontSize: 12, width: 26 }}>
              {u.mri.suite ? `#${u.mri.suite}` : "new"}
            </span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>
              {displayName(u)}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {displaySqft(u).toLocaleString()}
            </span>
            {!u.polygon && <span className="pill warn">unplaced</span>}
          </button>
        );
      })}
    </div>
  );
}

function OverrideForm({
  unit,
  onOverride,
  onCore,
}: {
  unit: Unit;
  onOverride: (patch: Partial<Unit["override"]>) => void;
  onCore: (patch: Partial<MriRecord>) => void;
}) {
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "inherit",
  };
  const cellLabel: React.CSSProperties = {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    marginBottom: 4,
    display: "block",
  };

  const manual = isManual(unit);

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
          marginBottom: 18,
        }}
      >
        {/* Left column: MRI reference (read-only) OR editable core fields
            for a manually-added space. */}
        {manual ? (
          <div>
            <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: 8 }}>
              Space details
            </div>

            <label style={cellLabel}>Name</label>
            <input
              style={inputStyle}
              value={unit.mri.tenantName}
              onChange={(e) => onCore({ tenantName: e.target.value })}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <div>
                <label style={cellLabel}>Suite #</label>
                <input
                  style={inputStyle}
                  value={unit.mri.suite}
                  placeholder="e.g. 19"
                  onChange={(e) => onCore({ suite: e.target.value })}
                />
              </div>
              <div>
                <label style={cellLabel}>Sq. Ft.</label>
                <input
                  style={inputStyle}
                  type="number"
                  value={unit.mri.sqft || ""}
                  onChange={(e) => onCore({ sqft: Number(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={cellLabel}>Status</label>
              <select
                style={inputStyle}
                value={unit.mri.status}
                onChange={(e) =>
                  onCore({ status: e.target.value as UnitStatus })
                }
              >
                <option value="occupied">Leased</option>
                <option value="vacant">Available</option>
                <option value="coming_soon">Coming soon</option>
              </select>
            </div>
          </div>
        ) : (
          <div
            style={{
              background: "#f7f9fc",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: 8 }}>
              From MRI (system of record)
            </div>
            <MriRow k="Tenant" v={unit.mri.tenantName} />
            <MriRow k="Sq. Ft." v={unit.mri.sqft.toLocaleString()} />
            <MriRow k="Status" v={STATUS_LABEL[unit.mri.status]} />
            <MriRow k="Suite" v={unit.mri.suite} />
          </div>
        )}

        {/* Right column: extra display fields. For MRI units these are
            overrides; for manual spaces they are just the space's fields. */}
        <div>
          <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: 8 }}>
            Display on website
          </div>

          {!manual && (
            <>
              <label style={cellLabel}>Display name (override)</label>
              <input
                style={inputStyle}
                placeholder={unit.mri.tenantName}
                value={unit.override.name ?? ""}
                onChange={(e) => onOverride({ name: e.target.value || undefined })}
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                <div>
                  <label style={cellLabel}>Sq. Ft. (override)</label>
                  <input
                    style={inputStyle}
                    type="number"
                    placeholder={String(unit.mri.sqft)}
                    value={unit.override.sqft ?? ""}
                    onChange={(e) =>
                      onOverride({
                        sqft: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </div>
                <div>
                  <label style={cellLabel}>Status (override)</label>
                  <select
                    style={inputStyle}
                    value={unit.override.status ?? ""}
                    onChange={(e) =>
                      onOverride({
                        status: (e.target.value || undefined) as
                          | UnitStatus
                          | undefined,
                      })
                    }
                  >
                    <option value="">— use MRI —</option>
                    <option value="occupied">Leased</option>
                    <option value="vacant">Available</option>
                    <option value="coming_soon">Coming soon</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: manual ? 0 : 10 }}>
            <div>
              <label style={cellLabel}>Category</label>
              <input
                style={inputStyle}
                value={unit.override.category ?? ""}
                onChange={(e) =>
                  onOverride({ category: e.target.value || undefined })
                }
              />
            </div>
            <div>
              <label style={cellLabel}>Website</label>
              <input
                style={inputStyle}
                placeholder="https://"
                value={unit.override.website ?? ""}
                onChange={(e) =>
                  onOverride({ website: e.target.value || undefined })
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MriRow({ k, v }: { k: string; v: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 13,
        padding: "4px 0",
      }}
    >
      <span style={{ color: "var(--text-muted)" }}>{k}</span>
      <span style={{ fontWeight: 600 }}>{v}</span>
    </div>
  );
}
