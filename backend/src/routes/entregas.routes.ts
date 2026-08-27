import { Router } from 'express';
import * as entregasController from '../controllers/entregas.controller';

const router = Router();

router.get('/', entregasController.getAllEntregas);
router.post('/sync', entregasController.syncEntregas);
router.delete('/:id', entregasController.deleteEntrega);

export default router;
