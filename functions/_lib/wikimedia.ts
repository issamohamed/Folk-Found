/**
 * Wikimedia access, with attribution treated as a hard requirement.
 *
 * Two deliberate rules live here:
 *
 * 1. Images come from each article's *lead image* (`prop=pageimages`), not from
 *    its raw file list. The raw list is unfiltered and includes interface icons
 *    and, on some folklore articles, explicit historical art that has no place
 *    in this UI. The lead image is editorially chosen and representative.
 *
 * 2. Only files served from /wikipedia/commons/ are returned. Files hosted
 *    locally on en.wikipedia are typically non-free "fair use" uploads, which we
 *    have no right to redisplay. Commons files carry a free licence, and we
 *    surface its name and the author alongside every image.
 */

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WIKI_REST = 'https://en.wikipedia.org/api/rest_v1/page/summary';

/** Wikimedia asks for a descriptive User-Agent identifying the application. */
const USER_AGENT =
  'FolkAndFound/0.1 (interactive world folklore map; https://github.com/folk-and-found)';

export interface ImageCredit {
  /** Wikipedia article title this image represents. */
  forTitle: string;
  src: string;
  width: number;
  height: number;
  /** Plain-text author/artist. Never empty — falls back to "Unknown author". */
  author: string;
  license: string;
  licenseUrl: string | null;
  /** Commons file page, so a reader can verify the attribution. */
  descriptionUrl: string;
}

export interface WikiSummary {
  title: string;
  extract: string;
  url: string;
}

async function wikiFetch(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Wikimedia request failed (${res.status})`);
  return res.json();
}

/**
 * MediaWiki treats underscores and spaces as equivalent in titles and echoes
 * them back normalised to spaces. Keying maps on the raw string silently loses
 * every multi-word filename, so both sides go through this first.
 */
function normalizeTitle(title: string): string {
  return title.replace(/_/g, ' ').trim();
}

/** MediaWiki returns attribution fields as HTML fragments. */
function toPlainText(html: string | undefined): string {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface PageImagesResponse {
  query?: { pages?: Array<{ title?: string; pageimage?: string }> };
}

interface ImageInfoResponse {
  query?: {
    pages?: Array<{
      title?: string;
      imageinfo?: Array<{
        url?: string;
        thumburl?: string;
        thumbwidth?: number;
        thumbheight?: number;
        descriptionurl?: string;
        extmetadata?: Record<string, { value?: string }>;
      }>;
    }>;
  };
}

/**
 * Lead image plus full attribution for each article title.
 * Two batched requests regardless of how many titles are asked for.
 */
export async function fetchImageCredits(
  titles: string[],
  thumbWidth = 800,
): Promise<ImageCredit[]> {
  if (titles.length === 0) return [];

  // Pass 1: the representative image filename for each article.
  const pagesUrl =
    `${WIKI_API}?action=query&format=json&formatversion=2&prop=pageimages` +
    `&piprop=name&titles=${encodeURIComponent(titles.join('|'))}`;
  const pagesBody = (await wikiFetch(pagesUrl)) as PageImagesResponse;

  const fileToTitle = new Map<string, string>();
  for (const page of pagesBody.query?.pages ?? []) {
    if (!page.pageimage || !page.title) continue;
    fileToTitle.set(normalizeTitle(`File:${page.pageimage}`), page.title);
  }
  if (fileToTitle.size === 0) return [];

  // Pass 2: URL, author and licence for those files.
  const files = [...fileToTitle.keys()];
  const infoUrl =
    `${WIKI_API}?action=query&format=json&formatversion=2&prop=imageinfo` +
    `&iiprop=url%7Cextmetadata&iiurlwidth=${thumbWidth}` +
    `&iiextmetadatafilter=Artist%7CCredit%7CLicenseShortName%7CLicenseUrl` +
    `&titles=${encodeURIComponent(files.join('|'))}`;
  const infoBody = (await wikiFetch(infoUrl)) as ImageInfoResponse;

  const credits: ImageCredit[] = [];
  for (const page of infoBody.query?.pages ?? []) {
    const info = page.imageinfo?.[0];
    const forTitle = page.title ? fileToTitle.get(normalizeTitle(page.title)) : undefined;
    if (!info || !forTitle) continue;

    const src = info.thumburl ?? info.url;
    if (!src) continue;

    // Licensing gate: only redistribute Commons-hosted files.
    if (!src.includes('/wikipedia/commons/')) continue;

    const meta = info.extmetadata ?? {};
    const author =
      toPlainText(meta.Artist?.value) ||
      toPlainText(meta.Credit?.value) ||
      'Unknown author';
    const license = toPlainText(meta.LicenseShortName?.value) || 'See file page';

    credits.push({
      forTitle,
      src,
      width: info.thumbwidth ?? thumbWidth,
      height: info.thumbheight ?? 0,
      author,
      license,
      licenseUrl: meta.LicenseUrl?.value ?? null,
      descriptionUrl:
        info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${page.title}`,
    });
  }

  // Preserve the order the caller asked for, so the region's first creature
  // leads the image strip.
  const rank = new Map(titles.map((t, i) => [t, i]));
  credits.sort((a, b) => (rank.get(a.forTitle) ?? 99) - (rank.get(b.forTitle) ?? 99));
  return credits;
}

/**
 * Which of these article titles actually exist, in the order given.
 *
 * Roughly one title in twelve across folklore.json points at a page that is not
 * on Wikipedia (or has since been merged away). Checking in one batched request
 * lets the wiki card fall back to the region's next creature instead of
 * silently disappearing. Redirects are resolved, so an old title still counts
 * as present.
 */
export async function filterExistingTitles(titles: string[]): Promise<string[]> {
  if (titles.length === 0) return [];

  const url =
    `${WIKI_API}?action=query&format=json&formatversion=2&redirects=1` +
    `&titles=${encodeURIComponent(titles.join('|'))}`;
  const body = (await wikiFetch(url)) as {
    query?: {
      pages?: Array<{ title?: string; missing?: boolean }>;
      normalized?: Array<{ from: string; to: string }>;
      redirects?: Array<{ from: string; to: string }>;
    };
  };

  // Map each surviving page back to the title the caller asked for, following
  // the normalisation and redirect chains the API reports.
  const present = new Set(
    (body.query?.pages ?? [])
      .filter((page) => !page.missing && page.title)
      .map((page) => normalizeTitle(page.title!)),
  );
  const forward = new Map<string, string>();
  for (const step of [
    ...(body.query?.normalized ?? []),
    ...(body.query?.redirects ?? []),
  ]) {
    forward.set(normalizeTitle(step.from), normalizeTitle(step.to));
  }

  return titles.filter((title) => {
    let current = normalizeTitle(title);
    for (let hop = 0; hop < 4; hop++) {
      if (present.has(current)) return true;
      const next = forward.get(current);
      if (!next) return false;
      current = next;
    }
    return false;
  });
}

/**
 * First sentence of an extract. The REST endpoint returns a whole lead
 * paragraph, but the wiki card is meant to be a one-line doorway, not a second
 * article competing with the prose above it.
 *
 * Sentence splitting is done conservatively: a full stop only ends the sentence
 * when followed by whitespace and a capital, which keeps "St. Nicholas" and
 * "c. 1500" intact.
 */
export function firstSentence(extract: string, maxChars = 220): string {
  const text = extract.trim();
  const match = /[.!?](?=\s+[A-Z“"(])/.exec(text);
  const sentence = match ? text.slice(0, match.index + 1) : text;
  if (sentence.length <= maxChars) return sentence;

  // Still too long: cut on a word boundary rather than mid-word.
  const clipped = sentence.slice(0, maxChars);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).replace(/[,;:]$/, '')}…`;
}

/** One-line summary and canonical URL for a single article. */
export async function fetchSummary(title: string): Promise<WikiSummary | null> {
  const res = await fetch(`${WIKI_REST}/${encodeURIComponent(title)}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Wikipedia summary failed (${res.status})`);

  const body = (await res.json()) as {
    title?: string;
    extract?: string;
    content_urls?: { desktop?: { page?: string } };
  };
  if (!body.extract) return null;

  return {
    title: body.title ?? title,
    extract: firstSentence(body.extract),
    url:
      body.content_urls?.desktop?.page ??
      `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
  };
}
