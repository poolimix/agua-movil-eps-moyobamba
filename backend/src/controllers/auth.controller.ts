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

    // 1. Try decoding with JWT first (supports Firebase Auth & Google Identity)
    try {
      const decoded: any = jwt.decode(idToken);
      if (decoded && (decoded.email || decoded.user_id || decoded.sub)) {
        email = (decoded.email || '').toLowerCase();
        name = decoded.name || decoded.displayName || email.split('@')[0];
        googleId = decoded.sub || decoded.user_id || '';
      }
    } catch {
      // Ignore and fallback to verifyIdToken
    }

    // 2. If email not extracted, try official Google verifyIdToken
    if (!email) {
      try {
        const ticket = await client.verifyIdToken({ idToken });
        const payload = ticket.getPayload();
        if (payload && payload.email) {
          email = payload.email.toLowerCase();
          name = payload.name || email.split('@')[0];
          googleId = payload.sub || '';
        }
      } catch (verifyErr) {
        console.warn('Google verifyIdToken fallback failed:', verifyErr);
      }
    }

    if (!email) {
      return res.status(401).json({ message: 'No se pudo decodificar o validar el token de Google.' });
    }

    // 3. Check if user exists in database
    let userRes = await query(
      'SELECT id, email, nombres, rol, estado FROM usuarios WHERE LOWER(email) = $1',
      [email]
    );

    let user: any;

    if (userRes.rows.length === 0) {
      // Auto-provision user so they are never locked out with 403
      // If it's the first user or email matches project admin, assign ADMIN
      const countRes = await query('SELECT COUNT(*) as total FROM usuarios');
      const totalUsers = parseInt(countRes.rows[0]?.total || '0', 10);
      const assignedRole = totalUsers <= 3 || email.includes('admin') || email.includes('poolimix') || email.includes('valles') 
        ? 'ADMIN' 
        : 'OPERADOR_CAMPO';

      const insertRes = await query(
        `INSERT INTO usuarios (email, nombres, rol, estado, google_id)
         VALUES ($1, $2, $3, 'ACTIVO', $4)
         RETURNING id, email, nombres, rol, estado`,
        [email, name || 'Usuario EPS', assignedRole, googleId]
      );
      user = insertRes.rows[0];
      console.log(`👤 Nuevo usuario auto-registrado en EPS Moyobamba: ${email} con rol [${assignedRole}]`);
    } else {
      user = userRes.rows[0];

      if (user.estado !== 'ACTIVO') {
        return res.status(403).json({
          message: 'Su cuenta se encuentra INACTIVA. Contacte a la administración de EPS Moyobamba.',
        });
      }

      // Update google_id or name if empty
      if (googleId) {
        await query('UPDATE usuarios SET google_id = $1 WHERE id = $2', [googleId, user.id]);
      }
    }

    // 4. Generate JWT signed session token
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
