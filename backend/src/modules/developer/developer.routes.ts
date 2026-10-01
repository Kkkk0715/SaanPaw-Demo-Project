import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { developerController } from './developer.controller';

const router = Router();
router.use(authenticate, authorize('developer'));

router.get('/dashboard', asyncHandler(developerController.dashboard));
router.get('/overview', asyncHandler(developerController.overview));
router.patch('/users/:id/ban', asyncHandler(developerController.banUser));
router.delete('/users/:id', asyncHandler(developerController.deleteUser));

// Shelter Approval Management
router.get('/shelters/pending', asyncHandler(developerController.listPendingShelters));
router.patch('/shelters/:id/review', asyncHandler(developerController.reviewShelter));
router.delete('/shelters/:id', asyncHandler(developerController.deleteShelter));

// System Management
router.get('/system', asyncHandler(developerController.systemConfig));
router.patch('/system', asyncHandler(developerController.updateSystemConfig));

// Report Monitoring
router.get('/flags', asyncHandler(developerController.listFlags));
router.patch('/flags/:id/resolve', asyncHandler(developerController.resolveFlag));
router.delete('/reports/:kind(lost|found)/:id', asyncHandler(developerController.deleteReport));

export default router;
