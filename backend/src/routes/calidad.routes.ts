import { Router } from 'express';
import * as calidadController from '../controllers/calidad.controller';

const router = Router();

router.get('/calidad', calidadController.getControlesCalidad);
router.post('/calidad', calidadController.createControlCalidad);
router.get('/calidad/stats', calidadController.getCalidadStats);

export default router;
