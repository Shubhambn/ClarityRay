import { Router } from 'express';
import { z } from 'zod';
import { getProfileController, updateSettingsController } from '../controllers/userController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const settingsSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  preferences: z
    .object({
      showDisclaimerAlways: z.boolean().optional(),
      saveLocalHistory: z.boolean().optional(),
      enableDesktopNotifications: z.boolean().optional()
    })
    .optional()
});

router.get('/profile', requireAuth, getProfileController);
router.put('/settings', requireAuth, validate(settingsSchema), updateSettingsController);

export default router;
