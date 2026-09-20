import { Router } from 'express';
import * as informesController from '../controllers/informes.controller';

const router = Router();

// Endpoint de datos estructurados para los Cuadros Oficiales (Anexo 2)
router.get('/mensual', informesController.getInformeMensual);

// Endpoint de descarga de PDF oficial
router.get('/mensual/pdf', informesController.exportarInformePdf);

export default router;
