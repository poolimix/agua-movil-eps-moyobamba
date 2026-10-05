import { Router } from 'express';
import { verifyToken, requireRole } from '../middleware/auth.middleware';
import {
  getUsuarios,
  createUsuario,
  updateUsuario,
  deleteUsuario,
} from '../controllers/usuarios.controller';

const router = Router();

// Todas las rutas de gestión de usuarios requieren autenticación y rol SUPER_ADMIN o ADMIN
// El rol SUPERVISOR queda explícitamente bloqueado de crear/administrar usuarios
router.use(verifyToken);
router.use(requireRole(['SUPER_ADMIN', 'ADMIN']));

router.get('/', getUsuarios);
router.post('/', createUsuario);
router.put('/:id', updateUsuario);
router.delete('/:id', deleteUsuario);

export default router;
