// Public JSON API helpers: open CORS, edge caching, and the data license in every response.

export const API_LICENSE =
  "Results from Wikipedia draw pages by Wikipedia contributors, CC BY-SA 4.0; model figures by Baseline Today, CC BY-SA 4.0. Not affiliated with the ATP or WTA. Estimates, not betting advice.";

export function apiJson(data: unknown, { maxAge = 300, status = 200 }: { maxAge?: number; status?: number } = {}): Response {
  return Response.json(
    status === 200 ? { license: API_LICENSE, data } : data,
    {
      status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": status === 200 ? `public, max-age=60, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 4}` : "no-store",
      },
    },
  );
}

export const apiError = (message: string, status = 400) => apiJson({ error: message }, { status });

/** A positive integer id from a query parameter, or null. */
export function idParam(v: string | null): number | null {
  return v && /^\d{1,9}$/.test(v) ? Number(v) : null;
}
