import { crawlSite } from "@/lib/crawler";
import { validateSearchRequest } from "@/lib/search-validation";
import type { SearchRequest, SearchResponse, SearchStreamEvent } from "@/lib/types";

export const maxDuration = 60;

function createStreamEvent(event: SearchStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

export async function POST(request: Request) {
  let body: SearchRequest;

  try {
    body = (await request.json()) as SearchRequest;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const validation = validateSearchRequest(body);
  if (!validation.ok) {
    return new Response(JSON.stringify({ error: validation.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { url, searchType, query, maxPages } = validation.data;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const { matches, pagesScanned, errors } = await crawlSite(url, searchType, query, {
          maxPages,
          onProgress: (progress) => {
            const event: SearchStreamEvent = { type: "progress", ...progress };
            controller.enqueue(createStreamEvent(event));
          },
        });

        const response: SearchResponse = {
          startUrl: url,
          searchType,
          query,
          pagesScanned,
          matches,
          errors,
        };

        controller.enqueue(
          createStreamEvent({
            type: "complete",
            ...response,
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Search failed";
        controller.enqueue(createStreamEvent({ type: "error", message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
