import {
  authoritativeItems,
  data,
  isEraId,
  json,
  methodNotAllowed,
  type Env,
} from '../_lib/env';
import { fetchImageCredits, type ImageCredit } from '../_lib/wikimedia';

/** The popup shows one to three images; fetching more would be wasted work. */
const MAX_IMAGES = 3;

interface CachedImages {
  images: ImageCredit[];
  fetchedAt: string;
}

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

  // When the reader has picked one item out of the roll, the strip narrows to
  // it. Keyed by the item alone, since its pictures do not depend on which
  // region it was reached from.
  const focused = typeof entryKey === 'string' ? data.items[entryKey] : null;
  if (typeof entryKey === 'string' && !focused) {
    return json({ error: 'Unknown entry' }, 400);
  }

  const items = focused ? [focused] : authoritativeItems(regionCode, era);
  if (!items || items.length === 0) return json({ images: [] });

  const cacheKey = focused
    ? `img:entry:${entryKey}`
    : `img:${regionCode}:${era}`;

  const cached = await env.FOLKLORE_CACHE.get<CachedImages>(cacheKey, 'json');
  if (cached) {
    return json({ images: cached.images, cached: true }, 200, {
      'Cache-Control': 'public, max-age=86400',
    });
  }

  // Wiki titles are taken from the bundled data, in the order the region lists
  // its items, so the lead one leads the image strip.
  const titles = items.map((item) => decodeURIComponent(item.wiki));

  let images: ImageCredit[];
  try {
    images = (await fetchImageCredits(titles)).slice(0, MAX_IMAGES);
  } catch {
    // Images are enrichment, never the point of the panel. A Wikimedia outage
    // should not take the popup down with it.
    return json({ images: [], degraded: true }, 200);
  }

  await env.FOLKLORE_CACHE.put(
    cacheKey,
    JSON.stringify({ images, fetchedAt: new Date().toISOString() } satisfies CachedImages),
    // Commons files can be renamed or re-licensed; a month keeps attribution
    // fresh without re-querying on every click.
    { expirationTtl: 60 * 60 * 24 * 30 },
  );

  return json({ images, cached: false }, 200, { 'Cache-Control': 'public, max-age=86400' });
};

export const onRequest: PagesFunction<Env> = () => methodNotAllowed('POST');
