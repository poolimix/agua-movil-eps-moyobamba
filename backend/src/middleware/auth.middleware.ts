import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { auth as firebaseAuth } from '../config/firebase';

const JWT_SECRET = process.env.JWT_SECRET || 'EPS_MOYOBAMBA_SECRET_KEY_2026';

export interface AuthenticatedUser {
  id?: number;
  personal_id?: number | null;
  email: string;
  nombres: string;
  rol: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Middleware para validar el token JWT emitido por EPS Moyobamba o token de Google
 */
export const verifyToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No autorizado: Token de autenticación no proporcionado.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // 1. Intentar validar JWT firmado por el backend
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    req.user = decoded;
    return next();
  } catch (jwtErr) {
    // 2. Si falla JWT interno, intentar validar con Firebase Admin
    if (firebaseAuth) {
      try {
        const decodedFirebase = await firebaseAuth.verifyIdToken(token);
        req.user = {
          email: decodedFirebase.email || '',
          nombres: decodedFirebase.name || 'Usuario Google',
          rol: (decodedFirebase as any).rol || 'OPERADOR_CAMPO',
        };
        return next();
      } catch (fbErr) {
        // Ambas validaciones fallaron
      }
    }
    return res.status(401).json({ message: 'No autorizado: Sesión expirada o token inválido.' });
  }
};

/**
 * Middleware de Control de Acceso Basado en Roles (RBAC)
 * El rol ADMIN tiene acceso automático a todas las operaciones permitidas.
 */
export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'No autenticado: Debe iniciar sesión.' });
    }

    const userRole = (req.user.rol || '').toUpperCase();
    const allowedUpper = allowedRoles.map((r) => r.toUpperCase());

    // ADMIN siempre tiene permiso maestro
    if (userRole === 'ADMIN' || allowedUpper.includes(userRole)) {
      return next();
    }

    return res.status(403).json({
      message: `Acceso Denegado: Su rol (${userRole}) no cuenta con autorización para realizar esta acción. Roles requeridos: ${allowedRoles.join(', ')}.`,
      rolActual: userRole,
      rolesPermitidos: allowedRoles,
    });
  };
};
