import { Router } from 'express';
import * as sectoresController from '../controllers/sectores.controller';

const router = Router();

router.get('/', sectoresController.getAllSectores);
router.post('/', sectoresController.createSector);
router.put('/:id', sectoresController.updateSector);
router.delete('/:id', sectoresController.deleteSector);

export default router;
