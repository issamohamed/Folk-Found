import {
  DIRECTIVE_VERSION,
  authoritativeItems,
  data,
  isEraId,
  json,
  methodNotAllowed,
  type Env,
} from '../_lib/env';
import {
  WORD_MAX,
  WORD_MIN,
  buildLengthCorrection,
  buildSystemPrompt,
  buildUserPrompt,
  countWords,
} from '../_lib/prompt';
import { GroqError, groqComplete, type ChatMessage } from '../_lib/groq';

interface CachedDescription {
  prose: string;
  words: number;
  /** Directive fingerprint at write time; a mismatch retires the record. */
  v: string;
  generatedAt: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { regionCode?: unknown; era?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Expected a JSON body' }, 400);
  }

  const { regionCode, era } = body;
  if (typeof regionCode !== 'string' || !data.regions[regionCode]) {
    return json({ error: 'Unknown region' }, 400);
  }
  if (!isEraId(era)) {
    return json({ error: 'Unknown era' }, 400);
  }

  const region = data.regions[regionCode];
  const eraMeta = data.eras.find((e) => e.id === era)!;

  const items = authoritativeItems(regionCode, era);
  if (!items || items.length === 0) {
    return json({ error: 'Nothing recorded for that region and era' }, 404);
  }

  const cacheKey = `${regionCode}:${era}`;

  const cached = await env.FOLKLORE_CACHE.get<CachedDescription>(cacheKey, 'json');
  if (cached && cached.v === DIRECTIVE_VERSION) {
    return json(
      {
        regionCode,
        regionName: region.name,
        era,
        eraLabel: eraMeta.label,
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
    {
      role: 'user',
      content: buildUserPrompt({
        regionName: region.name,
        eraLabel: eraMeta.label,
        eraRange: eraMeta.range,
        items,
      }),
    },
  ];

  let prose: string;
  try {
    prose = await groqComplete(env.GROQ_API_KEY, messages);

    // The directives are explicit about the 130-190 word band. One corrective
    // pass fixes the common near-misses; beyond that we serve what we have
    // rather than burning further calls on a model that is not converging.
    if (countWords(prose) < WORD_MIN || countWords(prose) > WORD_MAX) {
      const retry = await groqComplete(env.GROQ_API_KEY, [
        ...messages,
        { role: 'assistant', content: prose },
        { role: 'user', content: buildLengthCorrection(prose) },
      ]);
      const retryWords = countWords(retry);
      if (
        (retryWords >= WORD_MIN && retryWords <= WORD_MAX) ||
        distanceFromBand(retryWords) < distanceFromBand(countWords(prose))
      ) {
        prose = retry;
      }
    }
  } catch (err) {
    const status = err instanceof GroqError ? err.status : 502;
    return json(
      { error: 'Could not generate a description right now' },
      status === 429 ? 429 : 502,
    );
  }

  const record: CachedDescription = {
    prose,
    words: countWords(prose),
    v: DIRECTIVE_VERSION,
    generatedAt: new Date().toISOString(),
  };

  // Cached indefinitely: the source facts do not change, and a repeat click
  // must never re-bill Groq. Editing a directive retires records via `v`.
  await env.FOLKLORE_CACHE.put(cacheKey, JSON.stringify(record));

  return json(
    {
      regionCode,
      regionName: region.name,
      era,
      eraLabel: eraMeta.label,
      prose: record.prose,
      words: record.words,
      cached: false,
    },
    200,
    { 'Cache-Control': 'public, max-age=86400' },
  );
};

export const onRequest: PagesFunction<Env> = () => methodNotAllowed('POST');

function distanceFromBand(words: number): number {
  if (words < WORD_MIN) return WORD_MIN - words;
  if (words > WORD_MAX) return words - WORD_MAX;
  return 0;
}
