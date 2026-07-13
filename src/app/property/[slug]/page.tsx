import Link from "next/link";
import { notFound } from "next/navigation";
import { getProperty } from "@/lib/store";
import { displayStatus } from "@/lib/types";
import SitePlanViewer from "@/components/SitePlanViewer";

export const dynamic = "force-dynamic";

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const property = await getProperty(slug);
  if (!property) notFound();

  const available = property.units.filter(
    (u) => displayStatus(u) === "vacant",
  ).length;
  const placed = property.units.filter((u) => u.polygon).length;

  return (
    <main className="container">
      <div className="prop-hero">
        <h1>{property.name}</h1>
        <p className="addr">
          {property.address}, {property.city}
        </p>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="num">{property.glaSqft.toLocaleString()}</div>
          <div className="label">Total GLA (SF)</div>
        </div>
        <div className="stat">
          <div className="num">{property.units.length}</div>
          <div className="label">Units</div>
        </div>
        <div className="stat">
          <div className="num">{available}</div>
          <div className="label">Available</div>
        </div>
      </div>

      <SitePlanViewer property={property} />

      <p style={{ marginTop: 16, fontSize: 13, color: "var(--text-muted)" }}>
        {placed} of {property.units.length} units placed on the plan.{" "}
        <Link
          href={`/property/${property.slug}/admin`}
          style={{ color: "var(--navy-500)", fontWeight: 600 }}
        >
          Edit site plan →
        </Link>
      </p>
    </main>
  );
}
