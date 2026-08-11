import {
  authoritativeItems,
  data,
  isEraId,
  json,
  methodNotAllowed,
  type Env,
} from '../_lib/env';
import { fetchSummary, filterExistingTitles, type WikiSummary } from '../_lib/wikimedia';

interface CachedSummary {
  summary: WikiSummary | null;
  /** Title of the item this summary belongs to. */
  label: string;
  fetchedAt: string;
}

/**
 * The "Read more on Wikipedia" card. It is a doorway to going deeper, never a
 * substitute for the story the prose already told, so it carries one line and
 * one link and nothing more.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { regionCode?: unknown; era?: unknown; entryKey?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Expected a JSON body' }, 400);
  }

  const { regionCode, era, entryKey } = body;
  if (typeof regionCode !== 'string' || !data.regions[regionCode]) {
    return json({ error: 'Unknown region' }, 400);
  }
  if (!isEraId(era)) return json({ error: 'Unknown era' }, 400);

  // Focused on one item, the card must be that item's article or none at all —
  // falling through to a neighbour's would be a quiet lie about what the reader
  // asked to see.
  const focused = typeof entryKey === 'string' ? data.items[entryKey] : null;
  if (typeof entryKey === 'string' && !focused) {
    return json({ error: 'Unknown entry' }, 400);
  }

  const items = focused ? [focused] : authoritativeItems(regionCode, era);
  if (!items || items.length === 0) return json({ summary: null });

  const cacheKey = focused
    ? `wiki:entry:${entryKey}`
    : `wiki:${regionCode}:${era}`;

  const cached = await env.FOLKLORE_CACHE.get<CachedSummary>(cacheKey, 'json');
  if (cached) {
    return json({ summary: cached.summary, label: cached.label, cached: true }, 200, {
      'Cache-Control': 'public, max-age=86400',
    });
  }

  // Titles are resolved from the bundled data rather than the request, so this
  // endpoint cannot be used to proxy arbitrary Wikipedia pages. The region's
  // items are tried in order and the first with a live article wins — a dead
  // link on the lead item costs the region its card otherwise.
  const byTitle = new Map(items.map((item) => [decodeURIComponent(item.wiki), item]));

  let summary: WikiSummary | null = null;
  let label = items[0].title;
  try {
    const live = await filterExistingTitles([...byTitle.keys()]);
    for (const title of live) {
      summary = await fetchSummary(title);
      if (summary) {
        label = byTitle.get(title)?.title ?? label;
        break;
      }
    }
  } catch {
    return json({ summary: null, label, degraded: true }, 200);
  }

  await env.FOLKLORE_CACHE.put(
    cacheKey,
    JSON.stringify({
      summary,
      label,
      fetchedAt: new Date().toISOString(),
    } satisfies CachedSummary),
    { expirationTtl: 60 * 60 * 24 * 30 },
  );

  return json({ summary, label, cached: false }, 200, {
    'Cache-Control': 'public, max-age=86400',
  });
};

export const onRequest: PagesFunction<Env> = () => methodNotAllowed('POST');
