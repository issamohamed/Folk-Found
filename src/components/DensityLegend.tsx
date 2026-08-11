import { DENSITY_STOPS } from '../data/densityScale';

/** Reads the ramp straight from the shared scale, so the legend can never drift
 *  from what the map is actually painting. */
export default function DensityLegend() {
  return (
    <div className="legend" aria-label="Folklore density">
      <span className="legend__caption">Folklore density</span>
      <ul className="legend__scale">
        {DENSITY_STOPS.map(({ density, stop }) => (
          <li key={density} className="legend__item">
            <span className="legend__swatch" style={{ background: stop.fill }} />
            <span className="legend__label">{stop.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
