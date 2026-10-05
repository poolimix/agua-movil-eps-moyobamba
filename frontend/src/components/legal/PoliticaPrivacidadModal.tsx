interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function PoliticaPrivacidadModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: 16,
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: 16,
        maxWidth: 680,
        width: '100%',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
        overflow: 'hidden',
      }}>
        {/* Cabecera */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f8fafc',
        }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#0284c7', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Transparencia y Protección de Datos
            </span>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0f172a' }}>
              Política de Privacidad y Tratamiento de Datos
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: '#64748b',
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Contenido con scroll */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', fontSize: 13, lineHeight: 1.65, color: '#334155' }}>
          <p>
            <strong>Fecha de entrada en vigencia:</strong> 1 de Enero de 2026<br />
            <strong>Entidad Responsable:</strong> EPS Moyobamba S.A. en el marco del <em>Convenio N° 023-2026/VIVIENDA/PNSU</em>.
          </p>

          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginTop: 14, marginBottom: 4 }}>
            1. Objeto y Cumplimiento Normativo
          </h3>
          <p>
            La plataforma <strong>Agua Móvil - EPS Moyobamba</strong> garantiza la protección de los datos personales de sus usuarios y operadores de conformidad con la <strong>Ley N° 29733 (Ley de Protección de Datos Personales de la República del Perú)</strong>, su Reglamento (D.S. 003-2013-JUS), y en estricto cumplimiento de las <strong>Políticas de Privacidad para Desarrolladores de Apple Inc. (Apple Developer Program License Agreement)</strong> y las <strong>Políticas de Consentimiento de Google Identity Services</strong>.
          </p>

          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginTop: 14, marginBottom: 4 }}>
            2. Datos Recopilados Mediante Google y Apple Sign-In
          </h3>
          <p>
            Al iniciar sesión mediante los servicios oficiales de autenticación federada, se recopilan exclusivamente:
          </p>
          <ul style={{ paddingLeft: 20, margin: '6px 0' }}>
            <li><strong>Identificación de Usuario:</strong> Nombre completo y dirección de correo electrónico institucional o autorizada.</li>
            <li><strong>Identificador Único Federado:</strong> Claves públicas emitidas por Apple ID (incluyendo compatibilidad con <em>Hide My Email / Ocultar mi correo</em>) o Google Account ID para validar la sesión sin almacenar contraseñas.</li>
            <li><strong>Perfil y Rol Operativo:</strong> Asignación interna de rol (Super Admin, Supervisor, Conductor, Gestor de Entrega).</li>
            <li><strong>Datos de Auditoría Operativa:</strong> Coordenadas GPS de precisión y fotografías de entrega capturadas en campo para auditoría de abastecimiento de agua a favor de SUNASS y PNSU.</li>
          </ul>

          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginTop: 14, marginBottom: 4 }}>
            3. Finalidad del Tratamiento de Datos
          </h3>
          <p>
            Los datos se utilizan única y exclusivamente para:
          </p>
          <ul style={{ paddingLeft: 20, margin: '6px 0' }}>
            <li>Autenticar y autorizar a los trabajadores para el acceso al sistema de reparto de agua potable.</li>
            <li>Verificar la entrega gratuita de agua potable a beneficiarios empadronados según dotación reglamentaria (50 L/hab/día).</li>
            <li>Generar informes de fiscalización para el Ministerio de Vivienda, Construcción y Saneamiento y EPS Moyobamba.</li>
            <li><strong>En ningún caso</strong> los datos personales son comercializados, cedidos ni transferidos a terceros para fines de publicidad o rastreo publicitario comercial (cero seguimiento entre apps y sitios web de terceros).</li>
          </ul>

          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginTop: 14, marginBottom: 4 }}>
            4. Seguridad y Cifrado
          </h3>
          <p>
            Toda la transmisión de datos se encuentra protegida mediante cifrado TLS 1.3 en tránsito y estándares de control de acceso RBAC a nivel de base de datos. Los tokens de autenticación se gestionan con firmas criptográficas JWT con expiración definida.
          </p>

          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginTop: 14, marginBottom: 4 }}>
            5. Derechos del Usuario (ARCO) y Eliminación de Cuentas
          </h3>
          <p>
            Cualquier trabajador o usuario registrado tiene derecho a solicitar el acceso, rectificación, cancelación u oposición (ARCO) de sus datos, así como la eliminación inmediata de su cuenta de autenticación federada, comunicándose con la oficina de sistemas de EPS Moyobamba S.A. o enviando un requerimiento a <code>administracion@epsmoyobamba.gob.pe</code>.
          </p>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'flex-end',
          backgroundColor: '#f8fafc',
        }}>
          <button
            onClick={onClose}
            style={{
              backgroundColor: '#0284c7',
              color: '#ffffff',
              border: 'none',
              padding: '9px 20px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Entendido y Conforme
          </button>
        </div>
      </div>
    </div>
  );
}
