import { Router } from 'express';
import multer from 'multer';
import * as beneficiariosController from '../controllers/beneficiarios.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', beneficiariosController.getAllBeneficiarios);
router.get('/buscar/:dni', beneficiariosController.getBeneficiarioByDni);
router.post('/', beneficiariosController.createBeneficiario);
router.put('/:id', beneficiariosController.updateBeneficiario);
router.delete('/:id', beneficiariosController.deleteBeneficiario);
router.post('/import-excel', upload.single('file'), beneficiariosController.importExcel);

export default router;
