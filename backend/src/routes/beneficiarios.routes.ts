import { Router } from 'express';
import multer from 'multer';
import * as beneficiariosController from '../controllers/beneficiarios.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', beneficiariosController.getAllBeneficiarios);
router.get('/buscar/:dni', beneficiariosController.getBeneficiarioByDni);

// Rutas de administración y edición protegidas por rol
router.post('/', verifyToken, requireRole(['ADMIN', 'SUPERVISOR']), beneficiariosController.createBeneficiario);
router.put('/:id', verifyToken, requireRole(['ADMIN', 'SUPERVISOR']), beneficiariosController.updateBeneficiario);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), beneficiariosController.deleteBeneficiario);
router.post('/import-excel', verifyToken, requireRole(['ADMIN', 'SUPERVISOR']), upload.single('file'), beneficiariosController.importExcel);

export default router;
