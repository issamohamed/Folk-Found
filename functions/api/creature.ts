import { DIRECTIVE_VERSION, data, json, methodNotAllowed, type Env } from '../_lib/env';
import {
  ITEM_WORD_MAX,
  ITEM_WORD_MIN,
  buildItemPrompt,
  buildSystemPrompt,
  countWords,
} from '../_lib/prompt';
import { GroqError, groqComplete, type ChatMessage } from '../_lib/groq';

interface CachedItem {
  prose: string;
  words: number;
  /** Directive fingerprint at write time; a mismatch retires the record. */
  v: string;
  generatedAt: string;
}

/**
 * The entry for one item — a creature from the bestiary, or a single story out
 * of a region's tales.
 *
 * Cached by mode and key alone rather than by region and era. There are 415
 * creatures and 220 stories in total, and neither a creature's nature nor a
 * story's plot changes depending on which of the sixteen Pacific islands you
 * reached it from, so this is a small, bounded, permanent cache — Mo'o is
 * written once for everyone.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { entryKey?: unknown; regionCode?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Expected a JSON body' }, 400);
  }

  const { entryKey, regionCode } = body;
  if (typeof entryKey !== 'string' || !data.items[entryKey]) {
    return json({ error: 'Unknown entry' }, 400);
  }
  const item = data.items[entryKey];

  // Only used to colour the framing, so an unrecognised code degrades to a
  // neutral phrase rather than rejecting the request.
  const regionName =
    typeof regionCode === 'string' && data.regions[regionCode]
      ? data.regions[regionCode].name
      : 'the region it is rooted in';

  const cacheKey = `item:${entryKey}`;

  const cached = await env.FOLKLORE_CACHE.get<CachedItem>(cacheKey, 'json');
  if (cached && cached.v === DIRECTIVE_VERSION) {
    return json(
      {
        entryKey,
        label: item.title,
        prose: cached.prose,
        words: cached.words,
        cached: true,
      },
      200,
      { 'Cache-Control': 'public, max-age=86400' },
    );
  }

  if (!env.GROQ_API_KEY) {
    return json({ error: 'Description service is not configured' }, 503);
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(data.directive) },
    { role: 'user', content: buildItemPrompt(item, regionName) },
  ];

  let prose: string;
  try {
    prose = await groqComplete(env.GROQ_API_KEY, messages, { maxTokens: 400 });
  } catch (err) {
    const status = err instanceof GroqError ? err.status : 502;
    return json(
      { error: 'Could not write this entry right now' },
      status === 429 ? 429 : 502,
    );
  }

  const words = countWords(prose);
  const record: CachedItem = {
    prose,
    words,
    v: DIRECTIVE_VERSION,
    generatedAt: new Date().toISOString(),
  };

  // The single-item band is advisory rather than enforced with a second call:
  // the panel reads fine a few words either side, and a retry here would double
  // the cost of every first view.
  await env.FOLKLORE_CACHE.put(cacheKey, JSON.stringify(record));

  return json(
    {
      entryKey,
      label: item.title,
      prose,
      words,
      inBand: words >= ITEM_WORD_MIN && words <= ITEM_WORD_MAX,
      cached: false,
    },
    200,
    { 'Cache-Control': 'public, max-age=86400' },
  );
};

export const onRequest: PagesFunction<Env> = () => methodNotAllowed('POST');
