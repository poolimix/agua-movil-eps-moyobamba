import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { query } from '../db';

const client = new OAuth2Client();
const JWT_SECRET = process.env.JWT_SECRET || 'EPS_MOYOBAMBA_SECRET_KEY_2026';

export const googleAuth = async (req: Request, res: Response) => {
  try {
    const { idToken, email: bodyEmail } = req.body;

    if (!idToken && !bodyEmail) {
      return res.status(400).json({ message: 'Token de Google o Correo no proporcionado.' });
    }

    let email = bodyEmail ? String(bodyEmail).trim().toLowerCase() : '';
    let googleId = '';

    // 1. Try decoding with JWT if idToken is a real token
    if (idToken && idToken !== 'mock_token_or_google_token') {
      try {
        const decoded: any = jwt.decode(idToken);
        if (decoded) {
          if (!email && (decoded.email || decoded.user_id || decoded.sub)) {
            email = (decoded.email || '').toLowerCase();
          }
          googleId = decoded.sub || decoded.user_id || '';
        }
      } catch {
        // Fallback
      }

      // 2. If email not extracted yet, try official Google verifyIdToken
      if (!email) {
        try {
          const ticket = await client.verifyIdToken({ idToken });
          const payload = ticket.getPayload();
          if (payload && payload.email) {
            email = payload.email.toLowerCase();
            googleId = payload.sub || '';
          }
        } catch (verifyErr) {
          console.warn('Google verifyIdToken fallback:', verifyErr);
        }
      }
    }

    if (!email) {
      return res.status(401).json({ message: 'No se pudo obtener un correo válido de autenticación.' });
    }

    // 3. STRICT CHECK: Check if user exists in database
    const userRes = await query(
      'SELECT id, email, nombres, rol, estado FROM usuarios WHERE LOWER(email) = $1',
      [email]
    );

    if (userRes.rows.length === 0) {
      // STRICT SECURITY: Reject any unregistered email with 403
      return res.status(403).json({
        message: `Acceso Denegado: El correo (${email}) no está registrado en EPS Moyobamba. Solicite al Administrador que dé de alta su cuenta con su rol correspondiente.`,
        unauthorizedEmail: email,
      });
    }

    const user = userRes.rows[0];

    if (user.estado !== 'ACTIVO') {
      return res.status(403).json({
        message: `Acceso Denegado: Su cuenta (${email}) se encuentra INACTIVA. Contacte a la administración de EPS Moyobamba.`,
      });
    }

    // Update google_id if empty
    if (googleId) {
      await query('UPDATE usuarios SET google_id = $1 WHERE id = $2', [googleId, user.id]);
    }

    // 4. Generate JWT signed session token with strictly assigned database role
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        nombres: user.nombres,
        rol: user.rol, // STRICT ROLE: 'ADMIN', 'SUPERVISOR', 'OPERADOR_CAMPO', 'CONDUCTOR'
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
