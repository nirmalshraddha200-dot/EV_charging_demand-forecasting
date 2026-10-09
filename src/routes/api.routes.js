/**
 * API Routes for EV Charging Demand Forecasting Platform.
 */

import { Router } from 'express';
import {
  getCities,
  getStationsByCity,
  getStationById,
  getAllStations,
  generateTomorrowForecast
} from '../services/forecast.service.js';
import { recommendStations } from '../services/recommendation.service.js';
import { getStationAdminForecast } from '../services/admin.service.js';

const router = Router();

// 1. Get all supported cities
router.get('/cities', (req, res) => {
  try {
    const cities = getCities();
    return res.json({ success: true, count: cities.length, cities });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Get stations (filter by city or all)
router.get('/stations', (req, res) => {
  try {
    const { city } = req.query;
    if (city) {
      const stations = getStationsByCity(city);
      return res.json({ success: true, city, count: stations.length, stations });
    }
    const all = getAllStations();
    return res.json({ success: true, count: all.length, stations: all });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 3. Get single station details
router.get('/stations/:id', (req, res) => {
  try {
    const station = getStationById(req.params.id);
    if (!station) {
      return res.status(404).json({ success: false, message: 'Station not found' });
    }
    return res.json({ success: true, station });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Recommend best stations for driver based on city, distance, and tomorrow's time slot
router.post('/recommend', (req, res) => {
  try {
    const {
      cityName = 'Mumbai',
      userLat,
      userLng,
      targetHour = 10,
      batteryNeededKwh = 25,
      chargerPreference = 'any'
    } = req.body;

    if (!userLat || !userLng) {
      return res.status(400).json({
        success: false,
        message: 'Missing userLat or userLng coordinates.'
      });
    }

    const recommendationResult = recommendStations({
      cityName,
      userLat: parseFloat(userLat),
      userLng: parseFloat(userLng),
      targetHour: parseInt(targetHour, 10),
      batteryNeededKwh: parseFloat(batteryNeededKwh),
      chargerPreference
    });

    return res.json({ success: true, ...recommendationResult });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 5. Tomorrow's forecast for a specific station (General View)
router.get('/forecast/:stationId', (req, res) => {
  try {
    const station = getStationById(req.params.stationId);
    if (!station) {
      return res.status(404).json({ success: false, message: 'Station not found' });
    }
    const forecast = generateTomorrowForecast(station);
    return res.json({ success: true, forecast });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 6. Station Admin deep telemetry & forecast parameters
router.get('/admin/forecast/:stationId', (req, res) => {
  try {
    const adminData = getStationAdminForecast(req.params.stationId);
    return res.json({ success: true, ...adminData });
  } catch (error) {
    return res.status(404).json({ success: false, message: error.message });
  }
});

export default router;
