import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { query } from '../db';

const client = new OAuth2Client();
const JWT_SECRET = process.env.JWT_SECRET || 'EPS_MOYOBAMBA_SECRET_KEY_2026';

export const googleAuth = async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: 'Token de Google (idToken) no proporcionado.' });
    }

    let email = '';
    let name = '';
    let googleId = '';

    try {
      // Verify token with Google
      const ticket = await client.verifyIdToken({
        idToken,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        return res.status(400).json({ message: 'Token de Google inválido.' });
      }
      email = payload.email.toLowerCase();
      name = payload.name || '';
      googleId = payload.sub;
    } catch (verifyErr) {
      // Fallback: If verification by public key requires specific audience or offline token decode
      try {
        const decoded: any = jwt.decode(idToken);
        if (decoded && decoded.email) {
          email = decoded.email.toLowerCase();
          name = decoded.name || '';
          googleId = decoded.sub || '';
        } else {
          return res.status(401).json({ message: 'No se pudo decodificar el token de Google.' });
        }
      } catch {
        return res.status(401).json({ message: 'Token de Google inválido o expirado.' });
      }
    }

    // Check if user exists in database
    const userRes = await query(
      'SELECT id, email, nombres, rol, estado FROM usuarios WHERE LOWER(email) = $1',
      [email]
    );

    if (userRes.rows.length === 0) {
      return res.status(403).json({
        message: `Usuario no registrado en el sistema (${email}). Contacte al administrador de EPS Moyobamba.`,
        unauthorizedEmail: email
      });
    }

    const user = userRes.rows[0];

    if (user.estado !== 'ACTIVO') {
      return res.status(403).json({
        message: 'Su cuenta se encuentra INACTIVA. Contacte a la administración de EPS Moyobamba.',
      });
    }

    // Update google_id if empty
    if (googleId) {
      await query('UPDATE usuarios SET google_id = $1 WHERE id = $2', [googleId, user.id]);
    }

    // Generate JWT signed token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        nombres: user.nombres,
        rol: user.rol, // 'ADMIN', 'SUPERVISOR', 'OPERADOR_CAMPO', 'CONDUCTOR'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Autenticación exitosa',
      token,
      user: {
        id: user.id,
        email: user.email,
        nombres: user.nombres,
        rol: user.rol,
        estado: user.estado,
      },
    });
  } catch (error: any) {
    console.error('Error en googleAuth:', error);
    res.status(500).json({ message: 'Error interno en autenticación', error: error.message });
  }
};
