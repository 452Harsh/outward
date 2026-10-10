// Walk distance from GPS. Chrome on Android stops delivering positions to a
// hidden page, so we never rely on background tracking: when the page becomes
// visible again we take one fresh fix and add the straight-line segment from
// the last saved point.

const EARTH_M = 6371000;
const MAX_ACCURACY_M = 50;
const MIN_STEP_M = 8;
// Faster than this between two fixes is GPS noise or a vehicle, not walking.
const MAX_SPEED_MPS = 4;

export function haversine(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}

/**
 * Pure step function: add a fix to a walk.
 * @param {{last: object|null, meters: number, points: number, rejected: number}} walk
 * @param {{lat: number, lon: number, acc: number, t: number}} fix
 * @param {{resumed?: boolean}} [opts] resumed fixes come after a gap (screen off), so speed is checked against the gap.
 */
export function addFix(walk, fix, { resumed = false } = {}) {
  if (fix.acc > MAX_ACCURACY_M) return { ...walk, rejected: walk.rejected + 1 };
  if (!walk.last) return { ...walk, last: fix, points: walk.points + 1 };
  const d = haversine(walk.last, fix);
  const dt = Math.max(1, (fix.t - walk.last.t) / 1000);
  if (d < Math.max(MIN_STEP_M, fix.acc)) return walk;
  if (d / dt > MAX_SPEED_MPS) return { ...walk, last: fix, rejected: walk.rejected + 1 };
  return {
    ...walk,
    last: fix,
    meters: walk.meters + d,
    points: walk.points + 1,
    resumedMeters: (walk.resumedMeters ?? 0) + (resumed ? d : 0),
  };
}

export const emptyWalk = () => ({ last: null, meters: 0, points: 0, rejected: 0, resumedMeters: 0 });

const toFix = (pos) => ({
  lat: pos.coords.latitude,
  lon: pos.coords.longitude,
  acc: pos.coords.accuracy,
  t: pos.timestamp,
});

const GEO_OPTS = { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 };

/**
 * Track a walk while the page is visible, plus a catch-up fix on resume.
 * @param {object} initial walk state (restored from IndexedDB)
 * @param {(walk: object, info: {fix?: object, resumed?: boolean, error?: string}) => void} onChange
 * @returns {() => void} stop function
 */
export function trackWalk(initial, onChange) {
  if (!('geolocation' in navigator)) {
    onChange(initial, { error: 'unsupported' });
    return () => {};
  }
  let walk = initial ?? emptyWalk();
  const push = (pos, resumed) => {
    const fix = toFix(pos);
    walk = addFix(walk, fix, { resumed });
    onChange(walk, { fix, resumed });
  };
  const onError = (err) => onChange(walk, { error: err.message || String(err.code) });

  const watchId = navigator.geolocation.watchPosition((p) => push(p, false), onError, GEO_OPTS);
  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      navigator.geolocation.getCurrentPosition((p) => push(p, true), onError, { ...GEO_OPTS, maximumAge: 0 });
    }
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    navigator.geolocation.clearWatch(watchId);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
