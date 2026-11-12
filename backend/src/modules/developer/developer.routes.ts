import { Router } from 'express';
import { objectIdParam } from '../../middleware/security';
import { authenticate, authorize } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { developerController } from './developer.controller';

const router = Router();
// Every :id must look like a database id before it reaches a query.
router.param('id', objectIdParam);
router.use(authenticate, authorize('developer'));

router.get('/me', asyncHandler(developerController.me));
router.get('/dashboard', asyncHandler(developerController.dashboard));
router.get('/overview', asyncHandler(developerController.overview));
router.patch('/users/:id/ban', asyncHandler(developerController.banUser));
router.delete('/users/:id', asyncHandler(developerController.deleteUser));

// Shelter Approval Management
router.get('/shelters/pending', asyncHandler(developerController.listPendingShelters));
router.patch('/shelters/:id/review', asyncHandler(developerController.reviewShelter));
router.delete('/shelters/:id', asyncHandler(developerController.deleteShelter));
router.get('/shelters/:id/proofs', asyncHandler(developerController.listShelterProofs));
router.get('/proofs/:id', asyncHandler(developerController.getProofDocument));

// System Management
router.get('/system', asyncHandler(developerController.systemConfig));
router.patch('/system', asyncHandler(developerController.updateSystemConfig));

// Report Monitoring
router.get('/flags', asyncHandler(developerController.listFlags));
router.patch('/flags/:id/resolve', asyncHandler(developerController.resolveFlag));
router.delete('/reports/:kind(lost|found)/:id', asyncHandler(developerController.deleteReport));

export default router;
