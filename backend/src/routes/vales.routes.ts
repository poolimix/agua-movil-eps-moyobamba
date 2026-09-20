import { Router } from 'express';
import * as valesController from '../controllers/vales.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.get('/vales', valesController.getAllVales);
router.get('/vales/buscar/:query', valesController.buscarVale);
router.patch('/vales/:id/estado', verifyToken, valesController.cambiarEstadoVale);
router.post('/programaciones/:id/despachar-vales', verifyToken, requireRole(['ADMIN', 'SUPERVISOR']), valesController.despacharValesProgramacion);
router.get('/programaciones/:id/vales', valesController.getValesProgramacion);
router.post('/programaciones/:id/reintentar-vales-fallidos', verifyToken, requireRole(['ADMIN', 'SUPERVISOR']), valesController.reintentarValesFallidos);

export default router;
