import { useEffect, useRef, useState } from 'react';
import type { Dataset, EraId } from '../data/types';
import { useSearch, type SearchHit } from '../hooks/useSearch';

interface SearchBarProps {
  data: Dataset;
  era: EraId;
  onPick: (hit: SearchHit) => void;
}

/** Search by name, description or feeling. Picking a result opens the region
 *  that holds the creature, with the creature already focused. */
export default function SearchBar({ data, era, onPick }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useSearch(data, query, era);
  const hits = search.status === 'idle' ? [] : search.hits;

  // A new set of results should not leave the highlight pointing past the end.
  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const choose = (hit: SearchHit) => {
    onPick(hit);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!hits.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % hits.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + hits.length) % hits.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(hits[active]);
    }
  };

  const showPanel = open && query.trim().length >= 2;

  return (
    <div className="finder" ref={rootRef}>
      {showPanel ? (
        <div className="finder__results" role="listbox" aria-label="Search results">
          {hits.map((hit, i) => (
            <button
              key={hit.key}
              type="button"
              role="option"
              aria-selected={i === active}
              className={i === active ? 'finding is-active' : 'finding'}
              onPointerEnter={() => setActive(i)}
              onClick={() => choose(hit)}
            >
              <span className="finding__top">
                <span className="finding__label">
                  {hit.label}
                  {hit.qualifier ? (
                    <span className="finding__qualifier"> ({hit.qualifier})</span>
                  ) : null}
                </span>
                <span className="finding__type">{hit.type}</span>
              </span>
              <span className="finding__why">{hit.why || hit.seed}</span>
              {/* With the region already beside the name, repeating it here
                  would just be the same word twice. */}
              {hit.qualifier ? (
                hit.places > 1 ? (
                  <span className="finding__where finding__also">
                    in {hit.places} places
                  </span>
                ) : null
              ) : (
                <span className="finding__where">
                  {hit.regionName}
                  {hit.places > 1 ? (
                    <span className="finding__also"> · in {hit.places} places</span>
                  ) : null}
                </span>
              )}
            </button>
          ))}

          {/* Never an empty box: the panel always says where it has got to. */}
          {hits.length === 0 ? (
            <p className="finder__state">
              {search.status === 'searching'
                ? 'Looking through the bestiary…'
                : search.status === 'error'
                  ? 'Could not reach the bestiary. Try a creature’s name.'
                  : 'Nothing in the bestiary matches that yet.'}
            </p>
          ) : search.status === 'searching' ? (
            <p className="finder__state finder__state--quiet">
              Looking for more by meaning…
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="finder__bar">
        <svg className="finder__glass" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <line x1="15.8" y1="15.8" x2="20.5" y2="20.5" />
        </svg>
        <input
          ref={inputRef}
          className="finder__input"
          type="search"
          value={query}
          placeholder="Search the bestiary — a name, a description, a feeling"
          aria-label="Search folklore creatures"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {query ? (
          <button
            type="button"
            className="finder__clear"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}
