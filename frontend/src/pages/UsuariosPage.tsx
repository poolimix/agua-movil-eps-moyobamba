import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import api from '../config/api';
import { useAuth } from '../context/AuthContext';
import { dialogAlert, dialogConfirm } from '../context/DialogContext';
import './Modules.css';

interface Usuario {
  id: number;
  email: string;
  nombres: string;
  rol: string;
  estado: string;
  created_at?: string;
  personal_id?: number | null;
  dni?: string | null;
  telefono?: string | null;
  tipo_personal?: string | null;
}

export default function UsuariosPage() {
  const { isSuperAdmin, user: currentUser } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRol, setFilterRol] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [formData, setFormData] = useState({
    email: '',
    nombres: '',
    rol: 'SUPERVISOR',
    estado: 'ACTIVO',
    dni: '',
    telefono: '',
  });

  useEffect(() => {
    if (isSuperAdmin) {
      fetchUsuarios();
    } else {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  const fetchUsuarios = async () => {
    try {
      setLoading(true);
      const res = await api.get('/usuarios');
      setUsuarios(res.data);
    } catch (err: any) {
      console.error('Error fetching usuarios:', err);
      dialogAlert({
        title: 'Error al cargar usuarios',
        message: err.response?.data?.message || 'No se pudo obtener la lista de usuarios.',
        type: 'danger',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingUser(null);
    setFormData({
      email: '',
      nombres: '',
      rol: 'SUPERVISOR',
      estado: 'ACTIVO',
      dni: '',
      telefono: '',
    });
    setModalOpen(true);
  };

  const handleOpenEditModal = (u: Usuario) => {
    setEditingUser(u);
    setFormData({
      email: u.email,
      nombres: u.nombres,
      rol: u.rol,
      estado: u.estado,
      dni: u.dni || '',
      telefono: u.telefono || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email.trim() || !formData.nombres.trim() || !formData.rol) {
      dialogAlert({
        title: 'Campos requeridos',
        message: 'Por favor complete el correo electrónico, nombre completo y rol.',
        type: 'warning',
      });
      return;
    }

    try {
      if (editingUser) {
        await api.put(`/usuarios/${editingUser.id}`, {
          nombres: formData.nombres,
          rol: formData.rol,
          estado: formData.estado,
        });
        dialogAlert({
          title: 'Usuario Actualizado',
          message: `El usuario ${formData.email} fue actualizado correctamente.`,
          type: 'success',
        });
      } else {
        await api.post('/usuarios', formData);
        dialogAlert({
          title: 'Usuario Creado',
          message: `El usuario ${formData.email} fue creado con el rol ${formData.rol}.`,
          type: 'success',
        });
      }
      setModalOpen(false);
      fetchUsuarios();
    } catch (err: any) {
      console.error('Error saving usuario:', err);
      dialogAlert({
        title: 'Error al guardar',
        message: err.response?.data?.message || 'Error interno al procesar el usuario.',
        type: 'danger',
      });
    }
  };

  const handleDelete = async (u: Usuario) => {
    if (u.id === currentUser?.id) {
      dialogAlert({
        title: 'Acción no permitida',
        message: 'No puede eliminar su propia cuenta activa.',
        type: 'warning',
      });
      return;
    }

    const ok = await dialogConfirm({
      title: 'Eliminar Usuario',
      message: `¿Está seguro de eliminar al usuario "${u.nombres}" (${u.email})? Ya no podrá acceder al sistema.`,
      type: 'danger',
      confirmText: 'Sí, Eliminar',
      cancelText: 'Cancelar',
    });

    if (!ok) return;

    try {
      await api.delete(`/usuarios/${u.id}`);
      dialogAlert({
        title: 'Usuario Eliminado',
        message: 'El usuario fue eliminado del sistema exitosamente.',
        type: 'success',
      });
      fetchUsuarios();
    } catch (err: any) {
      dialogAlert({
        title: 'Error',
        message: err.response?.data?.message || 'No se pudo eliminar el usuario.',
        type: 'danger',
      });
    }
  };

  const getRoleBadge = (rol: string) => {
    switch (rol) {
      case 'SUPER_ADMIN':
      case 'ADMIN':
        return (
          <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '3px 8px', borderRadius: 6, fontWeight: 800, fontSize: 11 }}>
            👑 SUPER ADMIN
          </span>
        );
      case 'SUPERVISOR':
        return (
          <span style={{ background: '#f3e8ff', color: '#6b21a8', border: '1px solid #e9d5ff', padding: '3px 8px', borderRadius: 6, fontWeight: 800, fontSize: 11 }}>
            📋 SUPERVISOR
          </span>
        );
      case 'CONDUCTOR':
        return (
          <span style={{ background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe', padding: '3px 8px', borderRadius: 6, fontWeight: 800, fontSize: 11 }}>
            🚚 CONDUCTOR
          </span>
        );
      case 'GESTOR_ENTREGA':
        return (
          <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '3px 8px', borderRadius: 6, fontWeight: 800, fontSize: 11 }}>
            🤝 GESTOR DE ENTREGA
          </span>
        );
      default:
        return (
          <span style={{ background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: 6, fontWeight: 700, fontSize: 11 }}>
            {rol}
          </span>
        );
    }
  };

  // Restricción para no-SuperAdmin
  if (!isSuperAdmin) {
    return (
      <Layout>
        <div style={{ maxWidth: 700, margin: '60px auto', background: '#fff', borderRadius: 16, padding: 32, textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', border: '1px solid #fee2e2' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <h2 style={{ color: '#991b1b', margin: '0 0 8px', fontWeight: 800 }}>Acceso Restringido: Exclusivo Super Administrador</h2>
          <p style={{ color: '#475569', fontSize: 14, lineHeight: 1.6, margin: '0 0 20px' }}>
            Los <strong>Supervisores</strong> cuentan con permisos para visualizar y operar todos los procesos del sistema (Dashboard, Metas, Beneficiarios, Programaciones, Vales, Calidad e Informes), pero la <strong>creación y gestión de usuarios</strong> está reservada únicamente para el <strong>Super Administrador</strong>.
          </p>
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, fontSize: 12, color: '#64748b' }}>
            Si requiere dar de alta a un nuevo Conductor, Gestor de Entrega o Supervisor, solicítelo al Super Administrador asignado.
          </div>
        </div>
      </Layout>
    );
  }

  // Filtrado de usuarios
  const filteredUsuarios = usuarios.filter((u) => {
    const matchSearch =
      u.nombres.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.dni && u.dni.includes(searchTerm));
    const matchRol = !filterRol || u.rol === filterRol;
    const matchEstado = !filterEstado || u.estado === filterEstado;
    return matchSearch && matchRol && matchEstado;
  });

  const paginatedUsuarios = filteredUsuarios.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // KPIs
  const totalSuperAdmin = usuarios.filter((u) => u.rol === 'SUPER_ADMIN' || u.rol === 'ADMIN').length;
  const totalSupervisor = usuarios.filter((u) => u.rol === 'SUPERVISOR').length;
  const totalConductor = usuarios.filter((u) => u.rol === 'CONDUCTOR').length;
  const totalGestor = usuarios.filter((u) => u.rol === 'GESTOR_ENTREGA').length;

  return (
    <Layout>
      <div className="module-container">
        {/* Encabezado */}
        <div className="module-header">
          <div>
            <h1 className="module-title">👥 Gestión de Usuarios y Permisos del Sistema</h1>
            <p className="module-subtitle">
              Configuración y control de acceso por roles (Super Admin, Supervisores, Conductores y Gestores de Entrega)
            </p>
          </div>
          <button className="btn-primary" onClick={handleOpenCreateModal} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span>➕</span> Crear Nuevo Usuario
          </button>
        </div>

        {/* Resumen de Roles (KPIs) */}
        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 20 }}>
          <div style={{ background: '#fff', padding: '14px 18px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase' }}>👑 Super Administradores</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#b45309', marginTop: 4 }}>{totalSuperAdmin}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Control total y creación de cuentas</div>
          </div>

          <div style={{ background: '#fff', padding: '14px 18px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b21a8', textTransform: 'uppercase' }}>📋 Supervisores Operativos</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#7c3aed', marginTop: 4 }}>{totalSupervisor}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Todos los procesos (sin crear usuarios)</div>
          </div>

          <div style={{ background: '#fff', padding: '14px 18px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af', textTransform: 'uppercase' }}>🚚 Conductores de Cisterna</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#2563eb', marginTop: 4 }}>{totalConductor}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Módulo móvil: ruta y carga de agua</div>
          </div>

          <div style={{ background: '#fff', padding: '14px 18px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>🤝 Gestores de Entrega</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#16a34a', marginTop: 4 }}>{totalGestor}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Módulo móvil: reparto y canje de vales</div>
          </div>
        </div>

        {/* Barra de Filtros */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, background: '#fff', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Buscar por nombre, correo electrónico o DNI..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            style={{ flex: 1, minWidth: 260, padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
          />

          <select
            value={filterRol}
            onChange={(e) => {
              setFilterRol(e.target.value);
              setCurrentPage(1);
            }}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
          >
            <option value="">Todos los Roles</option>
            <option value="SUPER_ADMIN">👑 Super Admin</option>
            <option value="SUPERVISOR">📋 Supervisor</option>
            <option value="CONDUCTOR">🚚 Conductor</option>
            <option value="GESTOR_ENTREGA">🤝 Gestor de Entrega</option>
          </select>

          <select
            value={filterEstado}
            onChange={(e) => {
              setFilterEstado(e.target.value);
              setCurrentPage(1);
            }}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
          >
            <option value="">Todos los Estados</option>
            <option value="ACTIVO">Activos</option>
            <option value="INACTIVO">Inactivos</option>
          </select>

          <button
            className="btn-secondary"
            onClick={() => {
              setSearchTerm('');
              setFilterRol('');
              setFilterEstado('');
              setCurrentPage(1);
            }}
            style={{ padding: '8px 14px', fontSize: 13 }}
          >
            Limpiar
          </button>
        </div>

        {/* Tabla de Usuarios */}
        <div className="table-container" style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left', fontSize: 12 }}>
                <th style={{ padding: '12px 16px' }}>USUARIO / NOMBRE</th>
                <th style={{ padding: '12px 16px' }}>CORREO AUTORIZADO (GOOGLE)</th>
                <th style={{ padding: '12px 16px' }}>ROL ASIGNADO</th>
                <th style={{ padding: '12px 16px' }}>PERFIL OPERATIVO</th>
                <th style={{ padding: '12px 16px' }}>ESTADO</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
                    Cargando usuarios autorizados...
                  </td>
                </tr>
              ) : paginatedUsuarios.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
                    No se encontraron usuarios con los criterios especificados.
                  </td>
                </tr>
              ) : (
                paginatedUsuarios.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: '50%',
                            background: '#e0f2fe',
                            color: '#0284c7',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: 13,
                          }}
                        >
                          {u.nombres.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{u.nombres}</div>
                          {u.id === currentUser?.id && (
                            <span style={{ fontSize: 10, color: '#059669', fontWeight: 700 }}>● Tu Sesión Actual</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#334155', fontFamily: 'monospace', fontSize: 12 }}>
                      {u.email}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {getRoleBadge(u.rol)}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>
                      {u.dni ? (
                        <div>
                          <strong>DNI:</strong> {u.dni} {u.telefono ? `• 📞 ${u.telefono}` : ''}
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>Acceso Web Directo</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          background: u.estado === 'ACTIVO' ? '#dcfce7' : '#fee2e2',
                          color: u.estado === 'ACTIVO' ? '#15803d' : '#b91c1c',
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {u.estado}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button
                          onClick={() => handleOpenEditModal(u)}
                          style={{
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            border: '1px solid #bfdbfe',
                            padding: '4px 8px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                          title="Editar Rol y Permisos"
                        >
                          ✏️ Editar
                        </button>
                        {u.id !== currentUser?.id && (
                          <button
                            onClick={() => handleDelete(u)}
                            style={{
                              background: '#fef2f2',
                              color: '#dc2626',
                              border: '1px solid #fecaca',
                              padding: '4px 8px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                            title="Eliminar Usuario"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Paginación */}
          <Pagination
            currentPage={currentPage}
            totalItems={filteredUsuarios.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
          />
        </div>

        {/* Modal de Crear / Editar Usuario */}
        {modalOpen && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: 540 }}>
              <div className="modal-header">
                <h2>{editingUser ? '✏️ Modificar Permisos de Usuario' : '➕ Crear Nuevo Usuario Autorizado'}</h2>
                <button className="close-btn" onClick={() => setModalOpen(false)}>✕</button>
              </div>

              <form onSubmit={handleSubmit}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                      Correo Electrónico de Autenticación (Google / EPS) *
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      disabled={!!editingUser}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="ejemplo@epsmoyobamba.gob.pe o usuario@gmail.com"
                      required
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        fontSize: 13,
                        background: editingUser ? '#f1f5f9' : '#fff',
                      }}
                    />
                    <small style={{ color: '#64748b', fontSize: 11 }}>
                      Debe coincidir con la cuenta de Google con la que el usuario inicia sesión.
                    </small>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                      Nombres y Apellidos Completos *
                    </label>
                    <input
                      type="text"
                      value={formData.nombres}
                      onChange={(e) => setFormData({ ...formData, nombres: e.target.value })}
                      placeholder="Nombre y Apellidos del trabajador"
                      required
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                      Rol y Nivel de Acceso en el Sistema *
                    </label>
                    <select
                      value={formData.rol}
                      onChange={(e) => setFormData({ ...formData, rol: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontWeight: 600 }}
                    >
                      <option value="SUPERVISOR">📋 SUPERVISOR (Acceso operativo total, sin crear usuarios)</option>
                      <option value="CONDUCTOR">🚚 CONDUCTOR (Módulo móvil cisterna, rutas y carga)</option>
                      <option value="GESTOR_ENTREGA">🤝 GESTOR DE ENTREGA (Módulo móvil reparto y canje de vales)</option>
                      <option value="SUPER_ADMIN">👑 SUPER ADMIN (Control maestro total y gestión de usuarios)</option>
                    </select>

                    {/* Descripción dinámica del rol */}
                    <div style={{ marginTop: 6, padding: '8px 12px', borderRadius: 6, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 11.5, color: '#475569' }}>
                      {formData.rol === 'SUPERVISOR' && (
                        <span>
                          <strong>Supervisor:</strong> Puede ver y gestionar todos los procesos operativos (Dashboard, Beneficiarios, Programaciones, Vales, Calidad, Informes y Flota), pero <strong>no tiene permiso</strong> para crear nuevos usuarios.
                        </span>
                      )}
                      {formData.rol === 'CONDUCTOR' && (
                        <span>
                          <strong>Conductor:</strong> Accede en la app móvil a su módulo especializado de conducción con la programación más reciente, datos de su cisterna, recorrido y control de carga.
                        </span>
                      )}
                      {formData.rol === 'GESTOR_ENTREGA' && (
                        <span>
                          <strong>Gestor de Entrega:</strong> Accede en la app móvil para registrar repartos en ruta (DNI, QR, foto, firma). Solo visualiza su cisterna, chofer y sectores programados.
                        </span>
                      )}
                      {formData.rol === 'SUPER_ADMIN' && (
                        <span>
                          <strong>Super Administrador:</strong> Cuenta con privilegios maestros ilimitados. Puede configurar parámetros, dar de alta y baja a cualquier usuario o supervisor.
                        </span>
                      )}
                    </div>
                  </div>

                  {!editingUser && (formData.rol === 'CONDUCTOR' || formData.rol === 'GESTOR_ENTREGA') && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                          DNI (Opcional)
                        </label>
                        <input
                          type="text"
                          maxLength={8}
                          value={formData.dni}
                          onChange={(e) => setFormData({ ...formData, dni: e.target.value.replace(/\D/g, '') })}
                          placeholder="8 dígitos"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                          Teléfono Móvil
                        </label>
                        <input
                          type="text"
                          value={formData.telefono}
                          onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                          placeholder="9XXXXXXXX"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                      Estado de la Cuenta
                    </label>
                    <select
                      value={formData.estado}
                      onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                    >
                      <option value="ACTIVO">ACTIVO (Puede iniciar sesión)</option>
                      <option value="INACTIVO">INACTIVO (Acceso bloqueado)</option>
                    </select>
                  </div>
                </div>

                <div className="modal-footer" style={{ marginTop: 20 }}>
                  <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary">
                    {editingUser ? '💾 Guardar Cambios' : '➕ Crear Usuario'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
