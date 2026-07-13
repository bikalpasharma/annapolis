import Link from "next/link";
import { getSiteData } from "@/lib/store";
import { displayStatus } from "@/lib/types";
import PropertyCard from "@/components/PropertyCard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { properties } = await getSiteData();
  return (
    <main className="container">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div className="prop-hero">
          <h1>Available Properties</h1>
          <p className="addr">
            Retail leasing opportunities — click a property to explore its site
            plan.
          </p>
        </div>
        <Link className="btn primary" href="/property/new">
          + Add a property
        </Link>
      </div>

      <div className="card-grid">
        {properties.map((p) => (
          <PropertyCard
            key={p.slug}
            p={{
              slug: p.slug,
              name: p.name,
              address: p.address,
              city: p.city,
              image: p.sitePlanImage,
              unitCount: p.units.length,
              available: p.units.filter(
                (u) => displayStatus(u) === "vacant",
              ).length,
            }}
          />
        ))}

        <Link
          href="/property/new"
          className="prop-card"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 220,
            border: "2px dashed var(--border)",
            boxShadow: "none",
            color: "var(--navy-500)",
            fontWeight: 700,
          }}
        >
          + Add a property
        </Link>
      </div>
    </main>
  );
}
