import { ldScript } from "@/lib/structured-data";

/** schema.org structured data for search engines. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldScript(data) }} />;
}
