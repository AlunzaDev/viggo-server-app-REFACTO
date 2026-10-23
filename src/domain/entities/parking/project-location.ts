export type ProjectLocation = { lat: number; lng: number };

const toPoint = (value: unknown): ProjectLocation | null => {
  if (!Array.isArray(value) || value.length < 2) return null;
  const [lng, lat] = value.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat!) > 90 || Math.abs(lng!) > 180) return null;
  // [0, 0] is what a parking without a captured location holds.
  if (lat === 0 && lng === 0) return null;
  return { lat: lat!, lng: lng! };
};

/**
 * Where to put a parking on a map, from its stored `coordinates`: the point [lon, lat] itself,
 * or the average of an area's points [[lon, lat], ...]. Null when there is no usable location.
 */
export const projectLocation = (coordinates: unknown): ProjectLocation | null => {
  if (!Array.isArray(coordinates)) return null;
  if (!Array.isArray(coordinates[0])) return toPoint(coordinates);
  const points = coordinates.map(toPoint).filter((point): point is ProjectLocation => point !== null);
  if (!points.length) return null;
  return {
    lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
    lng: points.reduce((sum, point) => sum + point.lng, 0) / points.length,
  };
};
