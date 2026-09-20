import { Router } from 'express';
import * as cisternasController from '../controllers/cisternas.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.get('/', cisternasController.getAllCisternas);

// Operaciones protegidas por roles
router.post('/', verifyToken, requireRole(['ADMIN', 'SUPERVISOR']), cisternasController.createCisterna);
router.put('/:id', verifyToken, requireRole(['ADMIN', 'SUPERVISOR']), cisternasController.updateCisterna);
router.patch('/:id/ubicacion', verifyToken, cisternasController.updateUbicacionGps);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), cisternasController.deleteCisterna);

export default router;
