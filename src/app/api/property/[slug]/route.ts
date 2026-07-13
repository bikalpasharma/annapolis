import { NextRequest, NextResponse } from "next/server";
import { getProperty, saveProperty, deleteProperty } from "@/lib/store";
import type { Property } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const property = await getProperty(slug);
  if (!property) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(property);
}

// Save the property (units, polygons, overrides, image). In production this
// would persist to the CMS; MRI-owned fields would remain read-only and only
// polygons + overrides would be writable.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const body = (await req.json()) as Property;
  if (body.slug !== slug) {
    return NextResponse.json({ error: "Slug mismatch" }, { status: 400 });
  }
  try {
    const saved = await saveProperty(body);
    return NextResponse.json(saved);
  } catch (e) {
    console.error("PUT /api/property/[slug] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  try {
    const deleted = await deleteProperty(slug);
    return NextResponse.json({ deleted }, { status: deleted ? 200 : 404 });
  } catch (e) {
    console.error("DELETE /api/property/[slug] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
