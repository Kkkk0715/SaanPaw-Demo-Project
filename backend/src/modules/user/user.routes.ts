import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { blockBannedUser } from '../../middleware/blockBanned';
import { geoFence } from '../../middleware/geoFence';
import { asyncHandler } from '../../utils/asyncHandler';
import { userController } from './user.controller';

const router = Router();

// Registration (public)
router.post('/register', geoFence, asyncHandler(userController.register));

router.use(authenticate, authorize('user'), blockBannedUser);

router.get('/me', asyncHandler(userController.me));
router.patch('/profile', geoFence, asyncHandler(userController.updateProfile));
router.get('/reports/mine', asyncHandler(userController.myReports));
router.get('/cases', asyncHandler(userController.myCases));

router.get('/dashboard', asyncHandler(userController.dashboard));

// Report Lost Pet + status update
router.post('/reports/lost', geoFence, asyncHandler(userController.createLostReport));
router.patch('/reports/lost/:id/status', asyncHandler(userController.updateLostReportStatus));

// Report Found Animal
router.post('/reports/found', geoFence, asyncHandler(userController.createFoundReport));
router.patch('/reports/found/:id/status', asyncHandler(userController.updateFoundReportStatus));
router.delete('/reports/:kind(lost|found)/:id', asyncHandler(userController.deleteReport));

// Shelter View
router.get('/shelters', asyncHandler(userController.listShelters));
router.get('/shelters/:id/animals', asyncHandler(userController.listShelterAnimals));

// Image Recognition Matching (suggestions for one lost report, or an ad-hoc scan of any photo)
router.get('/reports/lost/:id/matches', asyncHandler(userController.matchSuggestions));
router.post('/match/scan', geoFence, asyncHandler(userController.scanPhoto));

// Map View Interface
router.get('/map/reports', asyncHandler(userController.mapReports));

// Search and Filter Reports
router.get('/reports/search', asyncHandler(userController.searchReports));

// Smart Notifications
router.get('/notifications', asyncHandler(userController.listNotifications));
router.patch('/notifications/:id/read', asyncHandler(userController.markNotificationRead));
router.put('/push-token', asyncHandler(userController.updatePushToken));

// Message box
router.get('/conversations', asyncHandler(userController.listConversations));
router.post('/conversations', asyncHandler(userController.startConversation));
router.post('/conversations/:id/messages', asyncHandler(userController.sendMessage));
router.post('/conversations/:id/read', asyncHandler(userController.markConversationRead));

export default router;
