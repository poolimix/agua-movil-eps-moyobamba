import { Router } from 'express';
import * as sectoresController from '../controllers/sectores.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.get('/', sectoresController.getAllSectores);

// Modificaciones protegidas por roles
router.post('/', verifyToken, requireRole(['ADMIN', 'SUPERVISOR']), sectoresController.createSector);
router.put('/:id', verifyToken, requireRole(['ADMIN', 'SUPERVISOR']), sectoresController.updateSector);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), sectoresController.deleteSector);

export default router;
