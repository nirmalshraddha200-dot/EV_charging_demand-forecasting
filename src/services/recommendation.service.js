/**
 * EV Driver Station Recommendation Service.
 * Evaluates candidate stations in the user's city for Tomorrow's selected Time Slot,
 * calculating distance, forecasted availability, queue wait time, tariff cost,
 * and a multi-factor recommendation score.
 */

import { getStationsByCity, generateTomorrowForecast } from './forecast.service.js';
import { haversineDistance, estimateTravelMinutes } from './geo.service.js';

export function recommendStations({
  cityName,
  userLat,
  userLng,
  targetHour = 10,
  batteryNeededKwh = 25,
  chargerPreference = 'any' // 'any' | 'dc_fast' | 'ac_l2'
}) {
  const stations = getStationsByCity(cityName);
  if (!stations || stations.length === 0) {
    return {
      cityName,
      targetHour,
      count: 0,
      recommendations: []
    };
  }

  const results = [];

  for (const station of stations) {
    // 1. Distance & Travel Time
    const distKm = haversineDistance(userLat, userLng, station.lat, station.lng);
    const driveMinutes = estimateTravelMinutes(distKm);

    // 2. Tomorrow's Forecast for this station
    const forecast = generateTomorrowForecast(station);
    const slotForecast = forecast.hourly.find((h) => h.hour === targetHour) || forecast.hourly[10];

    // 3. Charger preference filtering / scoring
    let speedBonus = 0;
    if (chargerPreference === 'dc_fast' && station.dc_fast_ports > 0) {
      speedBonus = 15;
    } else if (station.max_power_kw >= 150) {
      speedBonus = 12;
    } else if (station.max_power_kw >= 100) {
      speedBonus = 8;
    }

    // 4. Cost estimation for the session
    const estimatedCostInr = Math.round(batteryNeededKwh * slotForecast.tariffRate);

    // 5. Multi-factor Recommendation Score (0 - 100)
    // - Distance Penalty: closer is better (10 km = -20 pts)
    const distPenalty = Math.min(35, distKm * 2.2);

    // - Wait Penalty: 0 mins = 0 pts; 20 mins = -30 pts
    const waitPenalty = Math.min(35, slotForecast.avgWaitMins * 1.5 + (slotForecast.availablePorts === 0 ? 15 : 0));

    // - Price Penalty: baseline 8 ₹/kWh
    const pricePenalty = Math.max(0, (slotForecast.tariffRate - 7) * 2.5);

    // - Availability bonus: more free ports = more reliable
    const availBonus = Math.min(20, (slotForecast.availablePorts / station.total_ports) * 20);

    // - Rating bonus: 4.5+ gives up to 10 points
    const ratingBonus = ((station.rating || 4.0) - 3.5) * 10;

    let score = Math.round(
      100 - distPenalty - waitPenalty - pricePenalty + availBonus + ratingBonus + speedBonus
    );
    score = Math.max(15, Math.min(99, score)); // clamp 15 - 99

    // Estimated charging duration based on max power
    const chargingMinutes = Math.round((batteryNeededKwh / (station.max_power_kw * 0.75)) * 60);

    results.push({
      stationId: station.id,
      name: station.name,
      address: station.address,
      network: station.network,
      rating: station.rating,
      locationType: station.location_type,
      lat: station.lat,
      lng: station.lng,
      distanceKm: distKm,
      driveMinutes,
      maxPowerKw: station.max_power_kw,
      totalPorts: station.total_ports,
      dcFastPorts: station.dc_fast_ports,
      acL2Ports: station.ac_l2_ports,
      amenities: station.amenities,
      open24x7: station.open_24x7,
      forecastSlot: {
        timeSlot: slotForecast.timeLabel,
        forecastOccupancyPct: slotForecast.occupancyRate,
        forecastAvailablePorts: slotForecast.availablePorts,
        forecastOccupiedPorts: slotForecast.occupiedPorts,
        expectedWaitMinutes: slotForecast.avgWaitMins,
        queueProbabilityPct: slotForecast.queueProb,
        tariffRateInr: slotForecast.tariffRate,
        tariffTier: slotForecast.tariffTier,
        overloadRisk: slotForecast.overloadRisk
      },
      chargingEstimate: {
        batteryNeededKwh,
        estimatedCostInr,
        estimatedChargeTimeMins: chargingMinutes,
        totalTimeMins: driveMinutes + slotForecast.avgWaitMins + chargingMinutes
      },
      recommendationScore: score,
      badges: []
    });
  }

  // Sort by Recommendation Score (descending)
  results.sort((a, b) => b.recommendationScore - a.recommendationScore);

  // Assign informative badges
  if (results.length > 0) {
    results[0].badges.push({ type: 'best', label: '🌟 Best Overall Match', color: 'emerald' });
  }

  // Find closest
  const closest = [...results].sort((a, b) => a.distanceKm - b.distanceKm)[0];
  if (closest && !closest.badges.some((b) => b.type === 'best')) {
    closest.badges.push({ type: 'closest', label: '📍 Closest to You', color: 'blue' });
  }

  // Find cheapest
  const cheapest = [...results].sort(
    (a, b) => a.forecastSlot.tariffRateInr - b.forecastSlot.tariffRateInr
  )[0];
  if (cheapest && !cheapest.badges.some((b) => b.label.includes('Lowest Cost'))) {
    cheapest.badges.push({ type: 'cheapest', label: '💰 Lowest Tariff (₹)', color: 'amber' });
  }

  // Find fastest
  const fastest = [...results].sort((a, b) => b.maxPowerKw - a.maxPowerKw)[0];
  if (fastest && !fastest.badges.some((b) => b.label.includes('Fastest'))) {
    fastest.badges.push({ type: 'fastest', label: '⚡ Ultra-Fast Charger', color: 'purple' });
  }

  return {
    cityName,
    targetHour,
    timeSlotFormatted: `${String(targetHour).padStart(2, '0')}:00 - ${String((targetHour + 1) % 24).padStart(2, '0')}:00`,
    totalStationsFound: results.length,
    bestStationId: results[0]?.stationId,
    recommendations: results
  };
}
