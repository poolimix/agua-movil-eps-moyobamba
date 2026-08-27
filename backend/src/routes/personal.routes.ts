import { Router } from 'express';
import * as personalController from '../controllers/personal.controller';

const router = Router();

router.get('/', personalController.getAllPersonal);
router.post('/', personalController.createPersonal);
router.put('/:id', personalController.updatePersonal);
router.delete('/:id', personalController.deletePersonal);

export default router;
