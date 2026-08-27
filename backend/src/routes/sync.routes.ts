import { Router } from 'express';
import { upload, uploadDelivery } from '../controllers/sync.controller';

const router = Router();

// POST /api/v1/sync/upload-delivery
router.post('/upload-delivery', upload.single('foto'), uploadDelivery);

export default router;
