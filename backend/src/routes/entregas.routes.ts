import { Router } from 'express';
import * as entregasController from '../controllers/entregas.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.get('/', entregasController.getAllEntregas);
router.get('/:id/pdf', entregasController.generarActaPdf);
router.post('/sync', entregasController.syncEntregas);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), entregasController.deleteEntrega);

export default router;
