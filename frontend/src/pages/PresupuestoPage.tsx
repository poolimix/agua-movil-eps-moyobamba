import Layout from '../components/Layout';
import PresupuestoManager from '../components/presupuesto/PresupuestoManager';

export default function PresupuestoPage() {
  return (
    <Layout>
      <div className="module-container" style={{ padding: '0 4px' }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 26 }}>💰</span>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0f172a' }}>
                Gestión de Presupuesto PNSU - Meta 228
              </h1>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>
                Programación financiera en Soles (S/.), registro de gastos devengados y seguimiento de partidas oficiales del Convenio.
              </p>
            </div>
          </div>
        </div>

        <PresupuestoManager />
      </div>
    </Layout>
  );
}
