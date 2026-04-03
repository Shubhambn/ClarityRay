import { Router } from 'express';
import { z } from 'zod';
import { loginController, signupController } from '../controllers/authController.js';
import { authLimiter } from '../middleware/rateLimitMiddleware.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const signupSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.email(),
  password: z.string().min(8).max(128)
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128)
});

router.post('/signup', authLimiter, validate(signupSchema), signupController);
router.post('/login', authLimiter, validate(loginSchema), loginController);

export default router;
