import { Router } from 'express';
import * as configController from '../controllers/configuracion.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

// Lectura de parámetros abierta a usuarios autenticados / app móvil
router.get('/', configController.getConfiguracionHandler);

// Modificación reservada para administradores y supervisores
router.put('/', verifyToken, requireRole(['ADMIN', 'SUPERVISOR']), configController.updateConfiguracionHandler);
router.post('/', verifyToken, requireRole(['ADMIN', 'SUPERVISOR']), configController.updateConfiguracionHandler);

export default router;
