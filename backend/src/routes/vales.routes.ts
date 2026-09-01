import { Router } from 'express';
import * as valesController from '../controllers/vales.controller';

const router = Router();

router.get('/vales', valesController.getAllVales);
router.get('/vales/buscar/:query', valesController.buscarVale);
router.patch('/vales/:id/estado', valesController.cambiarEstadoVale);
router.post('/programaciones/:id/despachar-vales', valesController.despacharValesProgramacion);
router.get('/programaciones/:id/vales', valesController.getValesProgramacion);
router.post('/programaciones/:id/reintentar-vales-fallidos', valesController.reintentarValesFallidos);

export default router;
