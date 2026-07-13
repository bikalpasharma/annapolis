import { NextRequest, NextResponse } from "next/server";
import { createProperty, getSiteData } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getSiteData();
  return NextResponse.json(data.properties);
}

// Create a new property. In production the site-plan image would be uploaded to
// object storage and the property record created in the CMS.
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!body?.sitePlanImage) {
    return NextResponse.json(
      { error: "A site plan image is required" },
      { status: 400 },
    );
  }
  const property = await createProperty({
    name: body.name,
    address: body.address ?? "",
    city: body.city ?? "",
    glaSqft: Number(body.glaSqft) || 0,
    sitePlanImage: body.sitePlanImage,
    imageWidth: Number(body.imageWidth) || 0,
    imageHeight: Number(body.imageHeight) || 0,
  });
  return NextResponse.json(property, { status: 201 });
}
