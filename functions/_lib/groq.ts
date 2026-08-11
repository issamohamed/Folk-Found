const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/** The model that writes every entry. */
export const GROQ_MODEL = 'llama-3.3-70b-versatile';

/**
 * Retrieval model for search. Search ranks a fixed catalog rather than composing
 * prose, and sends all 415 creatures on every uncached query — around ten
 * thousand tokens. Through the 70B that exhausted the per-minute budget after
 * two searches and returned 429s.
 */
export const GROQ_SEARCH_MODEL = 'llama-3.1-8b-instant';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class GroqError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GroqError';
  }
}

export interface GroqOptions {
  /** Defaults to GROQ_MODEL — the 70B that writes every entry. */
  model?: string;
  /** Warm for prose, cool for matching. Defaults to 0.7. */
  temperature?: number;
  maxTokens?: number;
  /** Ask Groq to constrain the completion to a single JSON object. */
  json?: boolean;
  signal?: AbortSignal;
}

export async function groqComplete(
  apiKey: string,
  messages: ChatMessage[],
  options: GroqOptions = {},
): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model ?? GROQ_MODEL,
      messages,
      // Warm enough for vivid prose, cool enough to stay on the seed facts.
      temperature: options.temperature ?? 0.7,
      // The band is 130-190 words; headroom without inviting an essay.
      max_tokens: options.maxTokens ?? 500,
      ...(options.json ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new GroqError(
      `Groq request failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`,
      res.status,
    );
  }

  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new GroqError('Groq returned an empty completion', 502);
  return content;
}
