import { promises as fs } from "fs";
import path from "path";
import type { Property, SiteData } from "./types";
import seedJson from "../../data/site.json";

// ---------------------------------------------------------------------------
// Content layer.
//
// Single seam between the app and "where content lives". It has two backends:
//
//   • Redis (Upstash / Vercel KV)  — used whenever the KV env vars are present
//     (i.e. on Vercel). The whole SiteData document is stored under one key.
//     This is what makes the app work on Vercel's read-only serverless FS.
//   • Local JSON file             — used in local dev when no KV is configured,
//     so you can run the app with zero infra.
//
// In production this seam is where a headless CMS + MRI sync would plug in
// (see PROPOSAL.md); the rest of the app only ever calls these functions.
// ---------------------------------------------------------------------------

const seed = seedJson as unknown as SiteData;

const DATA_FILE = path.join(process.cwd(), "data", "site.json");
const REDIS_KEY = "annapolis:site";

const KV_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const USE_REDIS = Boolean(KV_URL && KV_TOKEN);

// Lazily construct the Redis client so local dev never loads it.
let redisClient: import("@upstash/redis").Redis | null = null;
async function redis() {
  if (!redisClient) {
    const { Redis } = await import("@upstash/redis");
    redisClient = new Redis({ url: KV_URL!, token: KV_TOKEN! });
  }
  return redisClient;
}

function clone(data: SiteData): SiteData {
  return JSON.parse(JSON.stringify(data)) as SiteData;
}

export async function getSiteData(): Promise<SiteData> {
  if (USE_REDIS) {
    const r = await redis();
    const stored = await r.get<SiteData>(REDIS_KEY);
    if (stored) return stored;
    // First run: seed the store from the bundled seed document.
    await r.set(REDIS_KEY, seed);
    return clone(seed);
  }
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw) as SiteData;
  } catch {
    return clone(seed);
  }
}

async function writeSiteData(data: SiteData): Promise<void> {
  if (USE_REDIS) {
    const r = await redis();
    await r.set(REDIS_KEY, data);
    return;
  }
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
