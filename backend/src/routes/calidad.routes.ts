import { Router } from 'express';
import * as calidadController from '../controllers/calidad.controller';
import { verifyToken } from '../middleware/auth.middleware';

const router = Router();

router.get('/calidad', calidadController.getControlesCalidad);
router.post('/calidad', verifyToken, calidadController.createControlCalidad);
router.get('/calidad/stats', calidadController.getCalidadStats);

export default router;
