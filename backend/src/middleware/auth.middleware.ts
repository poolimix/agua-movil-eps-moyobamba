import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';

export const verifyToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No autorizado: token no proporcionado.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    if (!auth) {
      console.warn('Firebase Admin no configurado, permitiendo desarrollo');
      return next();
    }
    const decoded = await auth.verifyIdToken(token);
    (req as any).user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'No autorizado: token inválido o expirado.' });
  }
};
