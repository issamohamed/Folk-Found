import { useEffect, useState } from 'react';
import type { RegionView } from '../data/types';
import { useDescription, type DescriptionFailure } from '../hooks/useDescription';
import { useEnrichment } from '../hooks/useEnrichment';

interface RegionPopupProps {
  view: RegionView;
  /** Creature the panel is narrowed to, or null for the whole region. */
  focusKey: string | null;
  onFocusChange: (key: string | null) => void;
  onClose: () => void;
}

/** What the panel says when the writing does not arrive. The creature roll is
 *  always there, so none of these is an empty state; each points back at it. */
const FAILURE_TEXT: Record<DescriptionFailure, string> = {
  'rate-limit':
    'The writing desk is busy just now. The creatures above are this place’s own — the full entry will come with a moment’s patience.',
  offline:
    'Could not reach the writing desk. The creatures above are this place’s own, and the entry will follow once the connection returns.',
  unconfigured:
    'The written entry is not available in this build. What the region holds is listed above.',
  unavailable:
    'The entry could not be written this time. The creatures above are this place’s own.',
};

/**
 * Region name, era, the creature roll, the prose, the images, the wiki card.
 *
 * The roll is both index and control: picking a name narrows everything below
 * to that creature while the roll itself stays put.
 */
export default function RegionPopup({
  view,
  focusKey,
  onFocusChange,
  onClose,
}: RegionPopupProps) {
  const focused = focusKey
    ? (view.items.find((item) => item.key === focusKey) ?? null)
    : null;

  const description = useDescription(view, focused ? focused.key : null);
  const { images, summary, summaryLabel } = useEnrichment(
    view,
    focused ? focused.key : null,
  );

  // Images that 404'd or refused a hotlink after the endpoint handed us their
  // URL. Dropping them beats letting the browser draw a broken frame.
  const [brokenImages, setBrokenImages] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => setBrokenImages(new Set()), [view.code, view.era.id, focused?.key]);
  const plates = images.filter((image) => !brokenImages.has(image.src));

  // The corner control names the key; the key works either way.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside className="popup" role="dialog" aria-label={`${view.name} folklore`}>
      <button
        type="button"
        className="popup__esc"
        onClick={onClose}
        aria-label="Close (Escape)"
        title="Close — or press Escape"
      >
        esc
      </button>

      <div className="popup__body">
        <h2 className="popup__name">{view.name}</h2>
        <p className="popup__era">
          {view.era.label} <span className="popup__range">{view.era.range}</span>
        </p>

        <ul className="roll">
          {view.items.map((item) => {
            const isFocused = item.key === focused?.key;
            const classes = ['roll__item'];
            if (item.sensitive) classes.push('roll__item--living');
            if (isFocused) classes.push('is-focused');
            return (
              <li key={item.key}>
                <button
                  type="button"
                  className={classes.join(' ')}
                  aria-pressed={isFocused}
                  title={item.seed}
                  // Picking the highlighted one again clears the focus.
                  onClick={() => onFocusChange(isFocused ? null : item.key)}
                >
                  {item.title}
                </button>
              </li>
            );
          })}
        </ul>

        {focused ? (
          <div className="focus">
            <div className="focus__head">
              <div>
                <h3 className="focus__name">{focused.title}</h3>
                <p className="focus__type">{focused.kind}</p>
              </div>
              <button
                type="button"
                className="focus__clear"
                onClick={() => onFocusChange(null)}
              >
                All {view.items.length}
              </button>
            </div>
            {/* From the data file, so it survives everything else failing. */}
            <p className="focus__seed">{focused.seed}</p>
          </div>
        ) : null}

        <div className="prose">
          {description.status === 'loading' ? (
            <div className="shimmer" aria-live="polite" aria-label="Writing the entry">
              <span className="shimmer__line" />
              <span className="shimmer__line" />
              <span className="shimmer__line" />
              <span className="shimmer__line shimmer__line--short" />
            </div>
          ) : null}

          {description.status === 'ready' ? (
            <p className="prose__text">{description.description.prose}</p>
          ) : null}

          {description.status === 'error' ? (
            <div className="notice" role="status">
              <p className="notice__text">{FAILURE_TEXT[description.reason]}</p>
              {description.reason === 'unconfigured' ? null : (
                <button type="button" className="notice__retry" onClick={description.retry}>
                  Try again
                </button>
              )}
            </div>
          ) : null}
        </div>

        {plates.length > 0 ? (
          <figure className="plates">
            {plates.map((image) => (
              <div key={image.src} className="plate">
                <img
                  className="plate__img"
                  src={image.src}
                  alt={image.forTitle}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => setBrokenImages((prev) => new Set(prev).add(image.src))}
                />
                {/* Attribution is a licensing requirement, not decoration. */}
                <figcaption className="plate__credit">
                  {image.forTitle} · {image.author} ·{' '}
                  {image.licenseUrl ? (
                    <a href={image.licenseUrl} target="_blank" rel="noreferrer noopener">
                      {image.license}
                    </a>
                  ) : (
                    image.license
                  )}{' '}
                  ·{' '}
                  <a href={image.descriptionUrl} target="_blank" rel="noreferrer noopener">
                    source
                  </a>
                </figcaption>
              </div>
            ))}
          </figure>
        ) : null}

        {summary ? (
          <a
            className="wiki-card"
            href={summary.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            <span className="wiki-card__label">
              Read more on Wikipedia
              {summaryLabel ? (
                <span className="wiki-card__topic"> · {summaryLabel}</span>
              ) : null}
            </span>
            <span className="wiki-card__extract">{summary.extract}</span>
          </a>
        ) : null}
      </div>
    </aside>
  );
}
