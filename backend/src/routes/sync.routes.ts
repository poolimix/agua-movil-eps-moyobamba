import { Router } from 'express';
import { upload, uploadDelivery, verificarPendientes } from '../controllers/sync.controller';

const router = Router();

// POST /api/v1/sync/upload-delivery
router.post('/upload-delivery', upload.single('foto'), uploadDelivery);

// GET /api/v1/sync/verificar-pendientes
router.get('/verificar-pendientes', verificarPendientes);
router.post('/verificar-pendientes', verificarPendientes);

export default router;
