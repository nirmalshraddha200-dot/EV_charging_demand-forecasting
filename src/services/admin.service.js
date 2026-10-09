/**
 * Station Administrator Forecasting & Analytics Service.
 * Provides granular grid telemetry, 24-hour demand projections, transformer safety limits,
 * revenue forecasts, BESS dispatch simulation, and actionable operational insights.
 */

import { getStationById, generateTomorrowForecast } from './forecast.service.js';

export function getStationAdminForecast(stationId) {
  const station = getStationById(stationId);
  if (!station) {
    throw new Error(`Station with ID '${stationId}' not found.`);
  }

  const rawForecast = generateTomorrowForecast(station);
  const { summary, hourly, transformerCapacityKw } = rawForecast;

  // 1. Identify critical operational windows
  const peakHourObj = hourly.reduce((max, h) => (h.energyKwh > max.energyKwh ? h : max), hourly[0]);
  const minHourObj = hourly.reduce((min, h) => (h.energyKwh < min.energyKwh ? h : min), hourly[0]);

  // Congested hours (occupancy >= 80%)
  const congestedHours = hourly
    .filter((h) => h.occupancyRate >= 80)
    .map((h) => ({
      hour: h.hour,
      timeLabel: h.timeLabel,
      occupancyRate: h.occupancyRate,
      occupiedPorts: h.occupiedPorts,
      avgWaitMins: h.avgWaitMins
    }));

  // Overload risk hours
  const overloadAlerts = hourly
    .filter((h) => h.overloadRisk !== 'SAFE')
    .map((h) => ({
      hour: h.hour,
      timeLabel: h.timeLabel,
      powerKw: h.powerKw,
      p90Kwh: h.p90Kwh,
      transformerCapacityKw,
      riskLevel: h.overloadRisk,
      marginRemainingKw: Math.max(0, transformerCapacityKw - h.powerKw)
    }));

  // 2. BESS Battery Peak Shaving & Financial Savings
  let bessTotalChargedKwh = 0;
  let bessTotalDischargedKwh = 0;
  let baselinePeakKw = summary.peakPowerKw;
  let shavedPeakKw = Math.max(...hourly.map((h) => h.netGridKw));
  let peakShavedKw = Math.max(0, baselinePeakKw - shavedPeakKw);

  // Financial simulation: charging off-peak vs discharging on-peak
  const offPeakRate = station.tariff.off_peak;
  const onPeakRate = station.tariff.peak;
  let bessChargingCost = 0;
  let bessDischargeValue = 0;

  hourly.forEach((h) => {
    if (h.bessAction === 'CHARGING') {
      bessTotalChargedKwh += h.bessPowerKw;
      bessChargingCost += h.bessPowerKw * h.tariffRate;
    } else if (h.bessAction === 'DISCHARGING') {
      const dischargeKwh = Math.abs(h.bessPowerKw);
      bessTotalDischargedKwh += dischargeKwh;
      bessDischargeValue += dischargeKwh * h.tariffRate;
    }
  });

  const netBessSavingsInr = Math.round(bessDischargeValue - bessChargingCost);

  // 3. Admin Operational Recommendations
  const recommendations = [];

  if (overloadAlerts.length > 0) {
    recommendations.push({
      type: 'warning',
      category: 'Grid Reliability',
      title: 'Transformer Overload Mitigation Required',
      description: `Predicted load exceeds 85% capacity during ${overloadAlerts.map((a) => a.timeLabel).join(', ')}. Activate BESS automated discharge or enable smart charging curtailment.`
    });
  } else {
    recommendations.push({
      type: 'success',
      category: 'Grid Reliability',
      title: 'Transformer Operating Within Safe Headroom',
      description: `Maximum transformer loading is projected at ${summary.transformerUtilizationPct}%, safely below the 85% thermal caution threshold.`
    });
  }

  if (congestedHours.length >= 3) {
    recommendations.push({
      type: 'info',
      category: 'Dynamic Pricing',
      title: 'Implement Peak Shifting Incentive',
      description: `Congestion peaks between ${congestedHours[0]?.timeLabel} and ${congestedHours[congestedHours.length - 1]?.timeLabel}. Offer a ₹2.5/kWh rebate during 13:00-15:00 to shift 20-30% of incoming drivers to mid-day.`
    });
  }

  recommendations.push({
    type: 'neutral',
    category: 'Maintenance Window',
    title: `Optimal Maintenance Time: ${minHourObj.timeLabel}`,
    description: `Predicted occupancy is lowest (${minHourObj.occupancyRate}%) at ${minHourObj.timeLabel} with only ${minHourObj.occupiedPorts} active sessions.`
  });

  return {
    station: {
      id: station.id,
      name: station.name,
      address: station.address,
      city: station.city,
      locationType: station.location_type,
      totalPorts: station.total_ports,
      dcFastPorts: station.dc_fast_ports,
      acL2Ports: station.ac_l2_ports,
      maxPowerKw: station.max_power_kw,
      transformerCapacityKw,
      tariff: station.tariff,
      network: station.network,
      rating: station.rating
    },
    forecastDate: rawForecast.forecastDate,
    isWeekend: rawForecast.isWeekend,
    kpiSummary: {
      totalEnergyForecastKwh: summary.totalEnergyForecastKwh,
      projectedRevenueInr: summary.projectedRevenueInr,
      peakPowerDemandKw: baselinePeakKw,
      peakTime: peakHourObj.timeLabel,
      transformerUtilizationPct: summary.transformerUtilizationPct,
      avgDailyOccupancyPct: summary.avgDailyOccupancyPct,
      congestedHoursCount: congestedHours.length,
      overloadAlertHoursCount: overloadAlerts.length,
      estimatedBessSavingsInr: netBessSavingsInr,
      peakShavedKw: Math.round(peakShavedKw)
    },
    bessOptimization: {
      bessInstalledCapacityKwh: 300,
      bessInverterRatingKw: 75,
      totalChargedKwh: Math.round(bessTotalChargedKwh),
      totalDischargedKwh: Math.round(bessTotalDischargedKwh),
      netSavingsInr: netBessSavingsInr,
      baselinePeakKw,
      shavedPeakKw: Math.round(shavedPeakKw),
      peakReductionPct: Math.round(((baselinePeakKw - shavedPeakKw) / (baselinePeakKw || 1)) * 100)
    },
    congestedHours,
    overloadAlerts,
    recommendations,
    hourly: hourly.map((h) => ({
      hour: h.hour,
      timeLabel: h.timeLabel,
      energyKwh: h.energyKwh,
      p10Kwh: h.p10Kwh,
      p50Kwh: h.p50Kwh,
      p90Kwh: h.p90Kwh,
      powerKw: h.powerKw,
      netGridKw: h.netGridKw,
      occupiedPorts: h.occupiedPorts,
      availablePorts: h.availablePorts,
      occupancyRate: h.occupancyRate,
      avgWaitMins: h.avgWaitMins,
      queueProb: h.queueProb,
      tariffRate: h.tariffRate,
      tariffTier: h.tariffTier,
      revenue: h.revenue,
      overloadRisk: h.overloadRisk,
      bessAction: h.bessAction,
      bessPowerKw: h.bessPowerKw
    }))
  };
}
