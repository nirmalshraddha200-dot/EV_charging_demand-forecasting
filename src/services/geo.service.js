/**
 * Haversine distance calculation and geo-utility functions.
 * Computes great-circle distance between two lat/lng points in km.
 */

const R = 6371; // Earth's radius in km

export function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // 1 decimal km
}

/**
 * Estimate travel time in minutes based on distance and city traffic.
 * Uses empirical avg speeds: city=20km/h, suburb=30km/h
 */
export function estimateTravelMinutes(distanceKm) {
  const avgSpeedKmph = distanceKm < 5 ? 20 : 28;
  return Math.round((distanceKm / avgSpeedKmph) * 60);
}
