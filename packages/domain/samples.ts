import type { PairData, Marker, Inspection, PointRef } from "./types";
export const sampleCatalog = [
  {
    slug: "checkout",
    name: "The disappearing discount",
    app: "Acme Store",
    description: "A checkout total changes after the server responds.",
    duration: 28400,
  },
  {
    slug: "search",
    name: "A search result out of order",
    app: "Atlas Workspace",
    description: "An earlier search response overwrites the latest results.",
    duration: 19200,
  },
];
export function sampleData(slug: string): PairData {
  const search = slug === "search",
    frontend = `sample-${slug}-browser`,
    backend = `sample-${slug}-server`;
  const specs = search
    ? [
        [
          1800,
          "frontend",
          "Search input changes",
          "The user types “design”. The browser starts request A.",
        ],
        [
          3200,
          "frontend",
          "A second search starts",
          "The user types “design systems”. Request B starts while A is pending.",
        ],
        [
          4100,
          "backend",
          "Latest search completes",
          "Request B returns the matching design-system documents.",
        ],
        [
          4600,
          "frontend",
          "Latest results render",
          "The browser displays the results of request B.",
        ],
        [
          7800,
          "backend",
          "Earlier search completes",
          "Request A returns after B because its database lookup was slower.",
        ],
        [
          8400,
          "frontend",
          "Stale results overwrite the list",
          "An unguarded setResults call accepts request A, even though the query has changed.",
        ],
      ]
    : [
        [
          2100,
          "frontend",
          "Apply discount",
          "The user applies WELCOME20. The client calculates a discounted total.",
        ],
        [
          4700,
          "frontend",
          "Checkout request sent",
          "POST /api/checkout includes the discount code and current cart.",
        ],
        [
          5600,
          "backend",
          "Discount lookup",
          "The server looks up WELCOME20 and finds its percentage rule.",
        ],
        [
          6200,
          "backend",
          "Price overwritten",
          "calculateTotal uses the subtotal when constructing the final response.",
        ],
        [
          7400,
          "frontend",
          "Response replaces cart total",
          "The checkout response sets total to 120, replacing the discounted value of 96.",
        ],
        [
          9300,
          "frontend",
          "Unexpected total renders",
          "The order summary displays $120.00 despite the applied coupon.",
        ],
      ];
  const markers: Marker[] = specs.map(
    ([time, runtime, label, description], i) => ({
      id: `${slug}-m${i}`,
      time: Number(time),
      runtime: runtime as any,
      label: String(label),
      description: String(description),
      point: {
        recordingId: runtime === "frontend" ? frontend : backend,
        executionPoint: `sample:${slug}:${i}`,
      },
      evidenceIds: [`${slug}-e${i}`],
    }),
  );
  return {
    duration: search ? 19200 : 28400,
    shots: [
      0,
      1200,
      2500,
      4700,
      6200,
      7900,
      9600,
      12000,
      16000,
      ...(search ? [] : [20000, 25000, 28400]),
    ].map((time, i) => ({ time, stage: i })),
    markers,
    correlations: [
      {
        id: `${slug}-request`,
        frontendPoint: markers[1].point,
        backendPoint: markers[2].point,
        label: search
          ? "GET /api/search · request B"
          : "POST /api/checkout · request c7f2",
        method: "explicit",
        lower: 280,
        upper: 320,
      },
    ],
    mappingRevision: 1,
    offset: 300,
    uncertainty: 20,
  };
}
const checkoutSource = `export async function calculateTotal(cart, coupon) {\n  const subtotal = cart.items.reduce(\n    (sum, item) => sum + item.price * item.quantity, 0\n  );\n  const discount = coupon ? subtotal * coupon.percent : 0;\n  const discountedTotal = subtotal - discount;\n\n  return {\n    subtotal,\n    discount,\n    total: subtotal, // Should use discountedTotal\n    currency: "USD"\n  };\n}`;
const checkoutClient = `async function submitCheckout() {\n  setSubmitting(true);\n  const response = await fetch("/api/checkout", {\n    method: "POST",\n    body: JSON.stringify({ cart, coupon: "WELCOME20" })\n  });\n  const checkout = await response.json();\n  setTotal(checkout.total);\n  setSubmitting(false);\n}`;
const searchClient = `async function searchDocuments(query) {\n  setLoading(true);\n  const response = await fetch(\n    "/api/search?q=" + encodeURIComponent(query)\n  );\n  const data = await response.json();\n  // No request generation check before updating state\n  setResults(data.results);\n  setLoading(false);\n}`;
const searchServer = `export async function search(req) {\n  const query = new URL(req.url).searchParams.get("q");\n  const results = await db.documents.search(query);\n  return Response.json({ query, results });\n}`;
export function sampleInspection(point: PointRef, frame = "0"): Inspection {
  const search = point.recordingId.includes("search"),
    backend = point.recordingId.endsWith("server");
  const source = search
    ? backend
      ? searchServer
      : searchClient
    : backend
      ? checkoutSource
      : checkoutClient;
  const path = search
    ? backend
      ? "server/routes/search.ts"
      : "src/components/Search.tsx"
    : backend
      ? "server/services/pricing.ts"
      : "src/pages/Checkout.tsx";
  const values = search
    ? [
        { name: "query", value: backend ? "design" : "design systems" },
        { name: "requestId", value: "request-A" },
        {
          name: "results",
          value: [
            { id: 17, title: "Design principles" },
            { id: 23, title: "Brand guidelines" },
          ],
        },
        { name: "latestRequestId", value: "request-B" },
      ]
    : [
        { name: "subtotal", value: 120 },
        { name: "discount", value: 24 },
        { name: "discountedTotal", value: 96 },
        { name: "coupon", value: { code: "WELCOME20", percent: 0.2 } },
        {
          name: "cart",
          value: {
            items: [
              { id: "shirt-1", name: "Studio shirt", price: 60, quantity: 2 },
            ],
            currency: "USD",
          },
        },
      ];
  return {
    point,
    frames: [
      {
        id: "0",
        name: search
          ? backend
            ? "search"
            : "searchDocuments"
          : backend
            ? "calculateTotal"
            : "submitCheckout",
        source: path,
        line: search ? (backend ? 3 : 8) : backend ? 11 : 8,
      },
      {
        id: "1",
        name: backend ? "handleRequest" : "onSubmit",
        source: backend ? "server/index.ts" : "src/App.tsx",
        line: 4,
      },
    ],
    selectedFrame: frame,
    source:
      frame === "0"
        ? source
        : `export async function ${backend ? "handleRequest" : "onSubmit"}(event) {\n  const context = { requestId: "demo-request" };\n  // Recorded caller frame\n  return await ${search ? (backend ? "search" : "searchDocuments") : backend ? "calculateTotal" : "submitCheckout"}(event);\n}`,
    line: frame === "0" ? (search ? (backend ? 3 : 8) : backend ? 11 : 8) : 4,
    scopes: [
      {
        name: "Local",
        values:
          frame === "0"
            ? values
            : [
                { name: "context", value: { requestId: "demo-request" } },
                {
                  name: "event",
                  value: { type: backend ? "request" : "submit" },
                },
              ],
      },
      {
        name: "Closure",
        values: [
          { name: "environment", value: "sample fixture" },
          { name: "undefinedExample", value: "undefined (recorded)" },
        ],
      },
    ],
    warning: "Illustrative sample state. This is not a live Replay recording.",
  };
}
export function sampleAnswer(slug: string, text: string) {
  const search = slug === "search";
  if (
    !/(why|total|discount|coupon|checkout|search|slow|result|request|happen|bug|wrong|race|explain)/i.test(
      text,
    )
  )
    return "This sample contains a fixed investigation, not a live model response. Explore its execution points, or import a real recording pair and configure the model to investigate this question.";
  return search
    ? "The earlier search request finishes after the newer one and overwrites its results. The browser starts request B for “design systems”, renders B’s results, then accepts request A for “design” without checking which request is current. Guard the update with a request generation ID or cancel superseded requests. This conclusion is from the labelled sample fixture."
    : "The backend calculates the $24 discount correctly, but returns the $120 subtotal as the final total. The frontend then replaces its discounted $96 total with that response. Return discountedTotal from calculateTotal. The problem crosses the request boundary; the coupon lookup itself succeeds. This conclusion is from the labelled sample fixture.";
}
