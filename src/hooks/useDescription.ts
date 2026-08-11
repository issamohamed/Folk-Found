import { useCallback, useEffect, useState } from 'react';
import type { RegionView } from '../data/types';

export interface Description {
  prose: string;
  words: number;
  cached: boolean;
}

/**
 * Why the prose is missing, in terms the panel can actually say something
 * useful about. The distinction matters: a rate limit is worth waiting out, a
 * dropped connection is worth retrying now, and an unconfigured service is not
 * the reader's problem at all.
 */
export type DescriptionFailure = 'rate-limit' | 'offline' | 'unconfigured' | 'unavailable';

export type DescriptionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; description: Description }
  | { status: 'error'; reason: DescriptionFailure };

/**
 * Fetches the generated prose for what the reader is currently looking at:
 * a whole region and era, or a single creature picked out of its roll.
 *
 * The Worker owns the prompt, the Groq key and the KV cache; this only says
 * which region, which era, and which creature if any. The entries are sent
 * along because that is the endpoint's documented shape, but the Worker
 * resolves them from its own bundled copy of entities.json, so nothing here can
 * influence what the model is told.
 */
export function useDescription(
  view: RegionView | null,
  focusKey: string | null = null,
): DescriptionState & { retry: () => void } {
  const [state, setState] = useState<DescriptionState>({ status: 'idle' });
  // Bumped to ask for the same thing again after a failure.
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const code = view?.code ?? null;
  const era = view?.era.id ?? null;

  useEffect(() => {
    if (!view || !code || !era) {
      setState({ status: 'idle' });
      return;
    }

    const controller = new AbortController();
    setState({ status: 'loading' });

    const request = focusKey
      ? {
          path: '/api/creature',
          body: { entryKey: focusKey, regionCode: view.code },
        }
      : {
          path: '/api/describe',
          body: { regionCode: view.code, era: view.era.id },
        };

    fetch(request.path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(request.body),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as {
          prose?: string;
          words?: number;
          cached?: boolean;
        } | null;

        if (!res.ok || !body?.prose) {
          throw new HttpFailure(res.status);
        }
        setState({
          status: 'ready',
          description: {
            prose: body.prose,
            words: body.words ?? 0,
            cached: body.cached ?? false,
          },
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', reason: classify(err) });
      });

    return () => controller.abort();
    // `view` is rebuilt on every render; the region, the era, the focused
    // creature and an explicit retry are what actually identify a request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, era, focusKey, attempt]);

  return { ...state, retry };
}

class HttpFailure extends Error {
  constructor(readonly status: number) {
    super(`Request failed (${status})`);
  }
}

function classify(err: unknown): DescriptionFailure {
  if (err instanceof HttpFailure) {
    if (err.status === 429) return 'rate-limit';
    if (err.status === 503) return 'unconfigured';
    return 'unavailable';
  }
  // fetch only rejects when the request never completed — no network, DNS
  // failure, or the dev API not running.
  return 'offline';
}
