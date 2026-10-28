import { Router } from 'express';
import * as entregasController from '../controllers/entregas.controller';
import { upload } from '../controllers/sync.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.get('/', entregasController.getAllEntregas);
router.get('/export-excel', entregasController.exportarEntregasExcel);
router.get('/export-pdf', entregasController.exportarFormatoPdf);
router.get('/:id/pdf', entregasController.generarActaPdf);
router.post('/sync', entregasController.syncEntregas);
router.post('/entrega-grupal-sector', upload.single('foto'), entregasController.registrarEntregaGrupalSector);
router.put('/lote/:loteId', verifyToken, entregasController.actualizarLoteDepositoSector);
router.delete('/lote/:loteId', verifyToken, requireRole(['ADMIN', 'SUPERVISOR']), entregasController.eliminarLoteDepositoSector);
router.post('/:id/foto', verifyToken, upload.single('foto'), entregasController.actualizarFotoEntrega);
router.put('/:id/foto', verifyToken, upload.single('foto'), entregasController.actualizarFotoEntrega);
router.delete('/:id', verifyToken, requireRole(['ADMIN']), entregasController.deleteEntrega);

export default router;
