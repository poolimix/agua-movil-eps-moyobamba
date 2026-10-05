import { Router } from 'express';
import * as programacionesController from '../controllers/programaciones.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.get('/', programacionesController.getAllProgramaciones);
router.get('/:id/pdf', programacionesController.generatePdf);
router.get('/:id/excel', programacionesController.exportarProgramacionExcel);

// Modificaciones protegidas por roles
router.post('/', verifyToken, requireRole(['ADMIN', 'SUPERVISOR']), programacionesController.createProgramacion);
router.put('/:id', verifyToken, requireRole(['ADMIN', 'SUPERVISOR']), programacionesController.updateProgramacion);
router.patch('/:id/estado', verifyToken, requireRole(['ADMIN', 'SUPERVISOR', 'CONDUCTOR', 'GESTOR_ENTREGA']), programacionesController.updateEstadoProgramacion);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), programacionesController.deleteProgramacion);

export default router;
