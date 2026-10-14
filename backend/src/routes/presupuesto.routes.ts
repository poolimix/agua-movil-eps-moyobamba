import { Router } from 'express';
import { verifyToken, requireRole } from '../middleware/auth.middleware';
import * as presupuestoController from '../controllers/presupuesto.controller';

const router = Router();

// 1. Consulta abierta para visualización del panel y dashboard
router.get('/', presupuestoController.getPresupuestoHandler);

// 2. Modificaciones restringidas a administradores y supervisores
router.use(verifyToken);
router.use(requireRole(['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR']));

// CRUD Meses
router.post('/meses', presupuestoController.createMesHandler);
router.put('/meses/:id', presupuestoController.updateMesHandler);
router.delete('/meses/:id', presupuestoController.deleteMesHandler);

// CRUD Partidas
router.post('/partidas', presupuestoController.createPartidaHandler);
router.put('/partidas/:id', presupuestoController.updatePartidaHandler);
router.delete('/partidas/:id', presupuestoController.deletePartidaHandler);

// Restablecer defaults
router.post('/restablecer-defaults', presupuestoController.restablecerDefaultsHandler);

export default router;
