import { Router } from 'express';
import * as authController from '../controllers/auth.controller';

const router = Router();

router.post('/google', authController.googleAuth);
router.post('/apple', authController.appleAuth);
router.post('/oauth', authController.oAuthUnified);

export default router;
