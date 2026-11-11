import { Router } from 'express';
import mongoose from 'mongoose';
import { blockWritesDuringMaintenance } from '../middleware/maintenance';
import { getSystemConfig } from '../services/systemConfig.service';
import authRoutes from '../modules/auth/auth.routes';
import developerRoutes from '../modules/developer/developer.routes';
import geoRoutes from '../modules/geo/geo.routes';
import shelterRoutes from '../modules/shelter/shelter.routes';
import uploadRoutes from '../modules/upload/upload.routes';
import userRoutes from '../modules/user/user.routes';

const api = Router();

// Load balancers and container platforms poll this: 503 while the database is unreachable takes the instance out of rotation.
api.get('/health', (_req, res) => {
  const database = mongoose.connection.readyState === 1;
  res.status(database ? 200 : 503).json({ status: database ? 'ok' : 'degraded', service: 'saanpaw-api', database });
});
/**
 * The switches the apps follow themselves (the geo-fence on the report map, maintenance), so the
 * mobile app obeys System Management instead of its own built-in rules. Read-only, no secrets.
 */
api.get('/config', async (_req, res, next) => {
  try {
    const c = await getSystemConfig();
    res.json({
      aiModeration: c.aiModeration,
      smartAlerts: c.smartAlerts,
      geoFence: c.geoFence,
      maintenanceMode: c.maintenanceMode,
    });
  } catch (err) {
    next(err);
  }
});
api.use('/auth', authRoutes);
api.use('/developer', developerRoutes);
api.use('/geo', geoRoutes);
// Maintenance mode: refuse writes from the mobile app, including from sessions signed in before it began.
api.use(['/shelter', '/uploads', '/user'], blockWritesDuringMaintenance);
api.use('/shelter', shelterRoutes);
api.use('/uploads', uploadRoutes);
api.use('/user', userRoutes);

export default api;
