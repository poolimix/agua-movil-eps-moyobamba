import { Router } from 'express';
import * as configController from '../controllers/configuracion.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

// Lectura de parámetros abierta a usuarios autenticados / app móvil
router.get('/', configController.getConfiguracionHandler);

// Versión y control de actualización obligatoria de la app móvil
router.get('/app-version', configController.getAppVersionHandler);
router.put('/app-version', verifyToken, requireRole(['ADMIN', 'SUPERVISOR']), configController.updateAppVersionHandler);

// Modificación reservada para administradores y supervisores
router.put('/', verifyToken, requireRole(['ADMIN', 'SUPERVISOR']), configController.updateConfiguracionHandler);
router.post('/', verifyToken, requireRole(['ADMIN', 'SUPERVISOR']), configController.updateConfiguracionHandler);

export default router;
