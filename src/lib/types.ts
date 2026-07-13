// Domain model for the Site Plan feature.
//
// Two layers of data are modeled deliberately, because they come from two
// different owners in the real system:
//
//   1. `mri`  — the record as it exists in MRI (the system of record). In the
//               PoC this is seeded from the Excel MCB provided. In production
//               it is synced from MRI on a schedule.
//   2. `override` — optional, editor-controlled values that win over MRI for
//               display purposes. This is how MCB "modifies/overrides data
//               from MRI to display what they want on the website".
//
// The `polygon` (the drawn boundary of the unit on the image) is NOT in MRI —
// it is authored in our admin panel and stored by us.

export type UnitStatus = "occupied" | "vacant" | "coming_soon";

/** A single [x, y] vertex, expressed as a percentage (0–100) of the image
 *  width / height respectively so the shape is resolution-independent. */
export type Point = [number, number];

export interface MriRecord {
  /** Suite number as it appears in MRI. */
  suite: string;
  tenantName: string;
  sqft: number;
  status: UnitStatus;
}

export interface UnitOverride {
  name?: string;
  sqft?: number;
  status?: UnitStatus;
  /** Merchandising category, useful for filtering on the public site. */
  category?: string;
  website?: string;
}

export interface Unit {
  id: string;
  /** Where this unit came from. `"mri"` (default) is synced from the system of
   *  record and its `mri` fields are read-only. `"manual"` is a space created
   *  directly in the admin (e.g. a pad/kiosk not yet in MRI); its core fields
   *  are edited in-app. */
  source?: "mri" | "manual";
  /** Snapshot synced from MRI (or, for manual spaces, the authored values). */
  mri: MriRecord;
  /** Editor overrides applied on top of MRI for display. */
  override: UnitOverride;
  /** Drawn boundary. `null` means the unit exists but has not been placed
   *  on the map yet — it shows up in the admin "unplaced units" tray. */
  polygon: Point[] | null;
}

export interface Property {
  slug: string;
  name: string;
  address: string;
  city: string;
  /** Path (under /public) or uploaded data-URL of the site plan image. */
  sitePlanImage: string;
  /** Natural width / height of the image, used to lock the overlay aspect. */
  imageWidth: number;
  imageHeight: number;
  glaSqft: number;
  units: Unit[];
}

export interface SiteData {
  properties: Property[];
}

// ---- Display helpers -------------------------------------------------------

/** Effective (display) values = MRI with any overrides applied. */
export function displayName(u: Unit): string {
  return u.override.name ?? u.mri.tenantName;
}
export function displaySqft(u: Unit): number {
  return u.override.sqft ?? u.mri.sqft;
}
export function displayStatus(u: Unit): UnitStatus {
  return u.override.status ?? u.mri.status;
}
export function hasOverride(u: Unit): boolean {
  return Object.values(u.override).some((v) => v !== undefined && v !== "");
}
export function isManual(u: Unit): boolean {
  return u.source === "manual";
}

export const STATUS_LABEL: Record<UnitStatus, string> = {
  occupied: "Leased",
  vacant: "Available",
  coming_soon: "Coming soon",
};
