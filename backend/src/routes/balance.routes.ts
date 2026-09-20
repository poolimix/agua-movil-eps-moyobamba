import { Router } from 'express';
import * as balanceController from '../controllers/balance.controller';

const router = Router();

router.get('/', balanceController.getBalanceHidrico);
router.get('/pdf', balanceController.exportarBalancePdf);

export default router;
