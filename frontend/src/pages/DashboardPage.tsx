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
}

const StatCard = ({ icon, label, value, color }: StatCardProps) => (
  <div className="stat-card" style={{ borderTopColor: color }}>
    <div className="stat-icon">{icon}</div>
    <div className="stat-info">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await axios.get('http://localhost:3000/api/v1/dashboard/stats');
      setStats(res.data);
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
          <h1>Dashboard</h1>
          <p>Resumen general del sistema de reparto de agua potable - EPS Moyobamba</p>
        </div>
        <button className="refresh-btn" onClick={fetchStats}>
          🔄 Actualizar
        </button>
      </header>

      {/* STATS */}
      <div className="stats-grid">
        <StatCard icon="👥" label="Total Beneficiarios" value={loading ? '...' : stats.totalBeneficiarios} color="#3b82f6" />
        <StatCard icon="📋" label="Programaciones Activas" value={loading ? '...' : stats.programacionesActivas} color="#8b5cf6" />
        <StatCard icon="✅" label="Entregas Realizadas" value={loading ? '...' : stats.entregasRealizadas} color="#10b981" />
        <StatCard icon="🚰" label="Total Litros Repartidos" value={loading ? '...' : `${stats.totalLitros} L`} color="#06b6d4" />
      </div>

      {/* QUICK ACTIONS */}
      <section className="quick-actions">
        <h2>Acciones Rápidas</h2>
        <div className="actions-grid">
          <Link to="/beneficiarios" className="action-card">
            <span className="action-icon">📥</span>
            <span className="action-label">Gestión e Importar Padrón (Excel)</span>
          </Link>
          <Link to="/programaciones" className="action-card">
            <span className="action-icon">📋</span>
            <span className="action-label">Programaciones y Descarga PDF</span>
          </Link>
          <Link to="/entregas" className="action-card">
            <span className="action-icon">🚰</span>
            <span className="action-label">Ver Entregas y Firmas en Campo</span>
          </Link>
        </div>
      </section>
    </Layout>
  );
}
