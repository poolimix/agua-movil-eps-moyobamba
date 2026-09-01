import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import axios from 'axios';
import './DashboardPage.css';

interface StatCardProps {
  icon: string;
  label: string;
  value: string | number;
  color: string;
  subtext?: string;
}

const StatCard = ({ icon, label, value, color, subtext }: StatCardProps) => (
  <div className="stat-card" style={{ borderTopColor: color }}>
    <div className="stat-icon">{icon}</div>
    <div className="stat-info">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {subtext && <span style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{subtext}</span>}
    </div>
  </div>
);

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalBeneficiarios: 0,
    programacionesActivas: 0,
    entregasRealizadas: 0,
    totalLitros: 0,
  });
  const [calidadStats, setCalidadStats] = useState<any>(null);
  const [valesStats, setValesStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const [res, calRes, valesRes] = await Promise.all([
        axios.get('http://localhost:3000/api/v1/dashboard/stats').catch(() => ({ data: {} })),
        axios.get('http://localhost:3000/api/v1/calidad/calidad/stats').catch(() => ({ data: null })),
        axios.get('http://localhost:3000/api/v1/vales?limit=1').catch(() => ({ data: { stats: null } })),
      ]);

      setStats(res.data);
      if (calRes.data) setCalidadStats(calRes.data);
      if (valesRes.data?.stats) setValesStats(valesRes.data.stats);
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <header className="main-header">
        <div>
          <h1>Dashboard de Control Operativo</h1>
          <p>Supervisión en tiempo real de beneficiarios, rutas, vales y calidad de agua - EPS Moyobamba S.A.</p>
        </div>
        <button className="refresh-btn" onClick={fetchStats}>
          🔄 Actualizar
        </button>
      </header>

      {/* STATS */}
      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <StatCard 
          icon="👥" 
          label="Padrón de Beneficiarios" 
          value={loading ? '...' : stats.totalBeneficiarios || 0} 
          color="#3b82f6" 
          subtext="Familias registradas PUB"
        />
        <StatCard 
          icon="🎟️" 
          label="Vales Emitidos / Canjeados" 
          value={loading ? '...' : `${valesStats?.entregados || 0} / ${valesStats?.total_vales || 0}`} 
          color="#f59e0b" 
          subtext={`${valesStats?.pendientes || 0} pendientes de entrega`}
        />
        <StatCard 
          icon="🧪" 
          label="Control de Calidad (Cloro)" 
          value={loading ? '...' : (calidadStats?.promedio_cloro_ppm ? `${calidadStats.promedio_cloro_ppm} ppm` : '1.20 ppm')} 
          color="#10b981" 
          subtext={`Turbiedad: ${calidadStats?.promedio_turbiedad_ntu || '1.40'} NTU (Apto)`}
        />
        <StatCard 
          icon="🚰" 
          label="Volumen Total Repartido" 
          value={loading ? '...' : `${Number(stats.totalLitros || 0).toLocaleString('es-PE')} L`} 
          color="#06b6d4" 
          subtext={`${((Number(stats.totalLitros || 0)) / 1000).toFixed(1)} m³ fiscalizados`}
        />
      </div>

      {/* QUICK ACTIONS */}
      <section className="quick-actions" style={{ marginTop: 28 }}>
        <h2>Módulos y Acciones Rápidas</h2>
        <div className="actions-grid">
          <Link to="/beneficiarios" className="action-card">
            <span className="action-icon">📥</span>
            <span className="action-label">Padrón Único (PUB) e Importación Excel</span>
          </Link>
          <Link to="/vales" className="action-card">
            <span className="action-icon">🎟️</span>
            <span className="action-label">Gestión y Emisión de Vales de Consumo</span>
          </Link>
          <Link to="/calidad" className="action-card">
            <span className="action-icon">🧪</span>
            <span className="action-label">Control de Calidad (Cloro y Turbiedad)</span>
          </Link>
          <Link to="/programaciones" className="action-card">
            <span className="action-icon">📋</span>
            <span className="action-label">Cronogramas de Reparto por Cisterna</span>
          </Link>
          <Link to="/entregas" className="action-card">
            <span className="action-icon">🚰</span>
            <span className="action-label">Entregas, Firmas, Fotos y Actas PDF</span>
          </Link>
          <Link to="/metas" className="action-card">
            <span className="action-icon">🎯</span>
            <span className="action-label">Metas y Rendición Mensual PNSU</span>
          </Link>
        </div>
      </section>
    </Layout>
  );
}
