/**
 * Main Express Application Server for EV Charging Demand Forecasting Platform.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './routes/api.routes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Security and utility middleware
app.use(
  helmet({
    contentSecurityPolicy: false // Allow CDN assets for simple responsive frontend
  })
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Mount API routes
app.use('/api', apiRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Node.js EV Charging Demand Forecasting Platform',
    timestamp: new Date().toISOString()
  });
});

// Serve frontend static assets
const publicPath = path.join(__dirname, '..', '..', 'frontend', 'public');
app.use(express.static(publicPath));

// Fallback to index.html for SPA client navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Start Express Server
app.listen(PORT, () => {
  console.log('='.repeat(70));
  console.log(`⚡ EV Charging Demand Forecasting Platform (Node.js)`);
  console.log(`🚀 Server running on: http://localhost:${PORT}`);
  console.log(`🌐 Public Web Dashboard: http://localhost:${PORT}`);
  console.log(`📡 API Endpoints available at: http://localhost:${PORT}/api`);
  console.log('='.repeat(70));
});

export default app;
