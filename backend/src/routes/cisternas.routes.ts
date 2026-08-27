import { Router } from 'express';
import * as cisternasController from '../controllers/cisternas.controller';

const router = Router();

router.get('/', cisternasController.getAllCisternas);
router.post('/', cisternasController.createCisterna);
router.put('/:id', cisternasController.updateCisterna);
router.delete('/:id', cisternasController.deleteCisterna);

export default router;
