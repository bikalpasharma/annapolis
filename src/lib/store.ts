import { promises as fs } from "fs";
import path from "path";
import type { Property, SiteData } from "./types";

// ---------------------------------------------------------------------------
// Content layer.
//
// This is the single seam between the app and "where content lives". In the
// PoC it is a JSON file on disk that stands in for the CMS + MRI sync. In
// production, swap the read/write bodies for a headless-CMS client (Payload /
// Sanity / Strapi) — the rest of the app is unaffected because it only ever
// talks to these functions.
// ---------------------------------------------------------------------------

const DATA_FILE = path.join(process.cwd(), "data", "site.json");

export async function getSiteData(): Promise<SiteData> {
  const raw = await fs.readFile(DATA_FILE, "utf-8");
  return JSON.parse(raw) as SiteData;
}

async function writeSiteData(data: SiteData): Promise<void> {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export async function getProperty(slug: string): Promise<Property | undefined> {
  const data = await getSiteData();
  return data.properties.find((p) => p.slug === slug);
}

export async function saveProperty(updated: Property): Promise<Property> {
  const data = await getSiteData();
  const idx = data.properties.findIndex((p) => p.slug === updated.slug);
  if (idx === -1) {
    data.properties.push(updated);
  } else {
    data.properties[idx] = updated;
  }
  await writeSiteData(data);
  return updated;
}

/** URL-safe slug from a property name, e.g. "Festival at Riva" -> "festival-at-riva". */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "property"
  );
}

export interface NewPropertyInput {
  name: string;
  address: string;
  city: string;
  glaSqft: number;
  sitePlanImage: string;
  imageWidth: number;
  imageHeight: number;
}

/** Create a new (empty) property. Slug is derived from the name and made unique. */
export async function createProperty(
  input: NewPropertyInput,
): Promise<Property> {
  const data = await getSiteData();
  const base = slugify(input.name);
  let slug = base;
  let n = 2;
  while (data.properties.some((p) => p.slug === slug)) slug = `${base}-${n++}`;

  const property: Property = {
    slug,
    name: input.name,
    address: input.address,
    city: input.city,
    sitePlanImage: input.sitePlanImage,
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    glaSqft: input.glaSqft,
    units: [],
  };
  data.properties.push(property);
  await writeSiteData(data);
  return property;
}

export async function deleteProperty(slug: string): Promise<boolean> {
  const data = await getSiteData();
  const before = data.properties.length;
  data.properties = data.properties.filter((p) => p.slug !== slug);
  if (data.properties.length === before) return false;
  await writeSiteData(data);
  return true;
}
