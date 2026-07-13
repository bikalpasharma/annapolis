import { notFound } from "next/navigation";
import { getProperty } from "@/lib/store";
import SitePlanEditor from "@/components/SitePlanEditor";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const property = await getProperty(slug);
  if (!property) notFound();
  return (
    <main className="container">
      <div className="prop-hero">
        <h1>Site Plan Editor</h1>
        <p className="addr">
          {property.name} — tag each unit on the plan and override MRI data for
          display.
        </p>
      </div>
      <SitePlanEditor initial={property} />
    </main>
  );
}
