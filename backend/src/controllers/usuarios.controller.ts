import { Request, Response } from 'express';
import { query } from '../db';

/**
 * Obtener todos los usuarios del sistema con sus roles y estado
 */
export const getUsuarios = async (_req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT 
        u.id,
        u.email,
        u.nombres,
        u.rol,
        u.estado,
        u.created_at,
        p.id as personal_id,
        p.dni,
        p.telefono,
        p.tipo_personal
      FROM usuarios u
      LEFT JOIN personal_operativo p ON LOWER(TRIM(p.email)) = LOWER(TRIM(u.email))
      ORDER BY 
        CASE 
          WHEN u.rol = 'SUPER_ADMIN' THEN 1
          WHEN u.rol = 'ADMIN' THEN 2
          WHEN u.rol = 'SUPERVISOR' THEN 3
          WHEN u.rol = 'CONDUCTOR' THEN 4
          WHEN u.rol = 'GESTOR_ENTREGA' THEN 5
          ELSE 6
        END,
        u.nombres ASC
    `);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error al listar usuarios:', error);
    res.status(500).json({ message: 'Error al listar usuarios', error: error.message });
  }
};

/**
 * Crear un nuevo usuario en el sistema (Exclusivo Super Admin)
 */
export const createUsuario = async (req: Request, res: Response) => {
  try {
    const { email, nombres, rol, estado = 'ACTIVO', dni, telefono } = req.body;

    if (!email || !nombres || !rol) {
      return res.status(400).json({ message: 'El correo electrónico, nombre completo y rol son obligatorios.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanRol = String(rol).trim().toUpperCase();

    // Validar roles permitidos
    const validRoles = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'CONDUCTOR', 'GESTOR_ENTREGA'];
    if (!validRoles.includes(cleanRol)) {
      return res.status(400).json({
        message: `Rol no válido. Los roles oficiales son: ${validRoles.join(', ')}`,
      });
    }

    // Verificar si ya existe
    const exists = await query('SELECT id FROM usuarios WHERE LOWER(email) = $1', [cleanEmail]);
    if (exists.rows.length > 0) {
      return res.status(400).json({ message: `Ya existe un usuario registrado con el correo ${cleanEmail}` });
    }

    // Insertar usuario
    const userRes = await query(
      `INSERT INTO usuarios (email, nombres, rol, estado)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, nombres, rol, estado, created_at`,
      [cleanEmail, nombres.trim(), cleanRol, estado.toUpperCase()]
    );

    const newUser = userRes.rows[0];

    // Si es CONDUCTOR o GESTOR_ENTREGA y se proporcionó DNI, registrar/actualizar en personal_operativo
    if ((cleanRol === 'CONDUCTOR' || cleanRol === 'GESTOR_ENTREGA') && dni) {
      const cleanDni = String(dni).trim();
      const existingPersonal = await query('SELECT id FROM personal_operativo WHERE dni = $1', [cleanDni]);

      if (existingPersonal.rows.length === 0) {
        const parts = nombres.trim().split(' ');
        const nom = parts[0] || nombres.trim();
        const ape = parts.slice(1).join(' ') || 'EPS';

        await query(
          `INSERT INTO personal_operativo (dni, nombres, apellidos, tipo_personal, telefono, email, estado)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [cleanDni, nom, ape, cleanRol, telefono || null, cleanEmail, estado.toUpperCase()]
        );
      } else {
        await query(
          `UPDATE personal_operativo 
           SET email = $1, tipo_personal = $2, estado = $3
           WHERE dni = $4`,
          [cleanEmail, cleanRol, estado.toUpperCase(), cleanDni]
        );
      }
    }

    res.status(201).json({
      message: 'Usuario creado exitosamente con sus permisos configurados',
      usuario: newUser,
    });
  } catch (error: any) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({ message: 'Error interno al crear usuario', error: error.message });
  }
};

/**
 * Actualizar rol, estado o nombres de un usuario (Exclusivo Super Admin)
 */
export const updateUsuario = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nombres, rol, estado } = req.body;

    // Verificar existencia del usuario
    const userRes = await query('SELECT id, email, rol FROM usuarios WHERE id = $1', [id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    const targetUser = userRes.rows[0];

    // Protección: Evitar que el Super Admin principal se desactive o se quite su rol a sí mismo
    const currentUser = (req as any).user;
    if (currentUser?.id === Number(id) && estado === 'INACTIVO') {
      return res.status(400).json({ message: 'No puede desactivar su propia cuenta de Super Administrador.' });
    }

    let cleanRol = targetUser.rol;
    if (rol) {
      cleanRol = String(rol).trim().toUpperCase();
      const validRoles = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'CONDUCTOR', 'GESTOR_ENTREGA'];
      if (!validRoles.includes(cleanRol)) {
        return res.status(400).json({ message: `Rol no válido. Permitidos: ${validRoles.join(', ')}` });
      }
    }

    const cleanEstado = estado ? String(estado).trim().toUpperCase() : targetUser.estado;
    const cleanNombres = nombres ? String(nombres).trim() : undefined;

    const updateRes = await query(
      `UPDATE usuarios 
       SET rol = $1, 
           estado = $2,
           nombres = COALESCE($3, nombres)
       WHERE id = $4
       RETURNING id, email, nombres, rol, estado`,
      [cleanRol, cleanEstado, cleanNombres || null, id]
    );

    // Sincronizar en personal_operativo si existe el correo
    await query(
      `UPDATE personal_operativo 
       SET estado = $1,
           tipo_personal = CASE 
             WHEN $2 IN ('CONDUCTOR', 'GESTOR_ENTREGA') THEN $2 
             ELSE tipo_personal 
           END
       WHERE LOWER(TRIM(email)) = LOWER(TRIM($3))`,
      [cleanEstado, cleanRol, targetUser.email]
    ).catch(() => {});

    res.json({
      message: 'Usuario actualizado correctamente',
      usuario: updateRes.rows[0],
    });
  } catch (error: any) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({ message: 'Error al actualizar usuario', error: error.message });
  }
};

/**
 * Eliminar un usuario (Exclusivo Super Admin)
 */
export const deleteUsuario = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const currentUser = (req as any).user;

    if (currentUser?.id === Number(id)) {
      return res.status(400).json({ message: 'No puede eliminar su propia cuenta de sesión actual.' });
    }

    const check = await query('SELECT email, rol FROM usuarios WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Desactivar o eliminar
    await query('DELETE FROM usuarios WHERE id = $1', [id]);

    res.json({ message: `Usuario ${check.rows[0].email} eliminado del sistema correctamente.` });
  } catch (error: any) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({ message: 'Error al eliminar usuario', error: error.message });
  }
};

/**
 * Garantizar que el Super Admin esté configurado al poner en producción
 */
export const bootstrapSuperAdmin = async () => {
  try {
    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@epsmoyobamba.gob.pe').trim().toLowerCase();
    const superAdminName = process.env.SUPER_ADMIN_NAME || 'Super Administrador EPS Moyobamba';

    await query(
      `INSERT INTO usuarios (email, nombres, rol, estado)
       VALUES ($1, $2, 'SUPER_ADMIN', 'ACTIVO')
       ON CONFLICT (email) DO UPDATE 
       SET rol = 'SUPER_ADMIN', estado = 'ACTIVO';`,
      [superAdminEmail, superAdminName]
    );

    console.log(`🔐 [RBAC] Super Administrador asegurado: ${superAdminEmail}`);
  } catch (e) {
    console.warn('Advertencia al configurar Super Admin:', e);
  }
};
