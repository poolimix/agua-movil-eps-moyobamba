interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function TerminosServicioModal({ isOpen, onClose }: Props) {
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
              Marco Operativo y Legal
            </span>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0f172a' }}>
              Términos y Condiciones de Uso del Sistema
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
            Bienvenido al sistema institucional <strong>Agua Móvil</strong>, plataforma tecnológica operada por <strong>EPS Moyobamba S.A.</strong> destinada a la gestión, fiscalización, entrega y liquidación del servicio gratuito de distribución de agua potable mediante camiones cisterna bajo el <strong>Convenio PNSU N° 023-2026/VIVIENDA</strong>.
          </p>

          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginTop: 14, marginBottom: 4 }}>
            1. Aceptación de los Términos
          </h3>
          <p>
            Al autenticarse a través de <strong>Google Identity</strong> o <strong>Sign in with Apple</strong>, usted declara ser trabajador, supervisor, conductor o personal debidamente autorizado por EPS Moyobamba S.A., y acepta cumplir a cabalidad los presentes Términos de Servicio.
          </p>

          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginTop: 14, marginBottom: 4 }}>
            2. Perfiles y Responsabilidades por Rol
          </h3>
          <ul style={{ paddingLeft: 20, margin: '6px 0' }}>
            <li><strong>Super Administrador:</strong> Responsable de la custodia de la plataforma, alta y baja de cuentas autorizadas y parámetros oficiales.</li>
            <li><strong>Supervisor:</strong> Responsable de velar por la ejecución veraz de las programaciones, calidad bacteriológica/sanitaria y liquidación técnica. No cuenta con facultades para crear cuentas ajenas.</li>
            <li><strong>Conductor:</strong> Responsable del cuidado de la unidad cisterna asignada, control de kilometraje y certificación de carga en planta.</li>
            <li><strong>Gestor de Entrega:</strong> Responsable de la fiscalización directa en punto de entrega, verificación de vales y registro fiel de beneficiarios sin alteración de datos.</li>
          </ul>

          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginTop: 14, marginBottom: 4 }}>
            3. Gratuidad Absoluta del Agua y Prohibición de Comercialización
          </h3>
          <p>
            El agua distribuida y los vales de consumo son <strong>100% gratuitos</strong>. Queda terminantemente prohibido exigir o aceptar cobros, propinas, canjes o cualquier contraprestación económica bajo responsabilidad administrativa, civil y penal conforme a las directivas de la <strong>SUNASS</strong> y el <strong>Ministerio de Vivienda, Construcción y Saneamiento</strong>.
          </p>

          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginTop: 14, marginBottom: 4 }}>
            4. Veracidad de la Información y Georreferenciación
          </h3>
          <p>
            Todo registro de entrega, fotografía y firma ingresada en la aplicación móvil constituye una declaración jurada de entrega efectiva. El sistema audita automáticamente coordenadas de satélite (GPS) y marcas de tiempo para garantizar la transparencia del gasto público del convenio.
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
            Aceptar y Continuar
          </button>
        </div>
      </div>
    </div>
  );
}
