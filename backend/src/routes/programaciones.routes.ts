import { Router } from 'express';
import * as programacionesController from '../controllers/programaciones.controller';

const router = Router();

router.get('/', programacionesController.getAllProgramaciones);
router.post('/', programacionesController.createProgramacion);
router.put('/:id', programacionesController.updateProgramacion);
router.delete('/:id', programacionesController.deleteProgramacion);
router.get('/:id/pdf', programacionesController.generatePdf);

export default router;
