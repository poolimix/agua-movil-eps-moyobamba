import { Router } from 'express';
import * as personalController from '../controllers/personal.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.get('/', personalController.getAllPersonal);

// Operaciones de gestión de personal protegidas para rol ADMIN
router.post('/', verifyToken, requireRole(['ADMIN']), personalController.createPersonal);
router.put('/:id', verifyToken, requireRole(['ADMIN']), personalController.updatePersonal);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), personalController.deletePersonal);

export default router;
