import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { geoFence } from '../../middleware/geoFence';
import { asyncHandler } from '../../utils/asyncHandler';
import { shelterController } from './shelter.controller';

const router = Router();

// Register is public (account is created in `pending` state, Developer approves).
router.post('/register', geoFence, asyncHandler(shelterController.register));

router.use(authenticate, authorize('shelter_admin'));

router.get('/me', asyncHandler(shelterController.me));
router.get('/dashboard', asyncHandler(shelterController.dashboard));

// Shelter Animals Management + Recovered Animals Posting
router.get('/animals', asyncHandler(shelterController.listShelterAnimals));
router.post('/animals', asyncHandler(shelterController.addShelterAnimal));
router.post('/animals/recovered', asyncHandler(shelterController.postRecovered));
router.patch('/animals/:id', asyncHandler(shelterController.updateAnimal));

// Animal Report Management + Animal Status Management
router.get('/reports', asyncHandler(shelterController.listAreaReports));
router.get('/cases', asyncHandler(shelterController.listCases));
router.post('/cases', asyncHandler(shelterController.openCase));
router.patch('/cases/:id/status', asyncHandler(shelterController.updateCaseStatus));

// Shelter Profile Management
router.patch('/profile', geoFence, asyncHandler(shelterController.updateProfile));
router.patch('/password', asyncHandler(shelterController.changePassword));

// Notification Management
router.get('/notifications', asyncHandler(shelterController.listNotifications));
router.patch('/notifications/:id/read', asyncHandler(shelterController.markNotificationRead));

// Message box
router.get('/conversations', asyncHandler(shelterController.listConversations));
router.post('/conversations/:id/messages', asyncHandler(shelterController.sendMessage));
router.post('/conversations/:id/read', asyncHandler(shelterController.markConversationRead));

export default router;
