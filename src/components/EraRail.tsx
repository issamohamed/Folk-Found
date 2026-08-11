import type { Era, EraId } from '../data/types';

interface EraRailProps {
  eras: Era[];
  active: EraId;
  onChange: (era: EraId) => void;
}

/** The vertical era rail. Order comes from the data file, which is already
 *  chronological; the rail never re-sorts it. */
export default function EraRail({ eras, active, onChange }: EraRailProps) {
  const activeIndex = eras.findIndex((e) => e.id === active);

  return (
    <nav className="rail" aria-label="Time period">
      <span className="rail__spine" aria-hidden="true">
        <span
          className="rail__spine-fill"
          style={{ height: `${(activeIndex / (eras.length - 1)) * 100}%` }}
        />
      </span>

      <ul className="rail__list">
        {eras.map((era) => {
          const isActive = era.id === active;
          return (
            <li key={era.id}>
              <button
                type="button"
                className={isActive ? 'rail__btn is-active' : 'rail__btn'}
                aria-pressed={isActive}
                onClick={() => onChange(era.id)}
              >
                <span className="rail__dot" aria-hidden="true" />
                <span className="rail__text">
                  <span className="rail__label">{era.label}</span>
                  <span className="rail__range">{era.range}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
