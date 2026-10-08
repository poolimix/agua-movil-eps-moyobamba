import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import authRoutes from './routes/auth.routes';
import beneficiariosRoutes from './routes/beneficiarios.routes';
import entregasRoutes from './routes/entregas.routes';
import programacionesRoutes from './routes/programaciones.routes';
import dashboardRoutes from './routes/dashboard.routes';
import cisternasRoutes from './routes/cisternas.routes';
import personalRoutes from './routes/personal.routes';
import syncRoutes from './routes/sync.routes';
import valesRoutes from './routes/vales.routes';
import sectoresRoutes from './routes/sectores.routes';
import calidadRoutes from './routes/calidad.routes';
import informesRoutes from './routes/informes.routes';
import balanceRoutes from './routes/balance.routes';
import configuracionRoutes from './routes/configuracion.routes';
import usuariosRoutes from './routes/usuarios.routes';
import { bootstrapSuperAdmin } from './controllers/usuarios.controller';
import { volvoConnectService } from './services/VolvoConnectService';
import { pool } from './db';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Configuración flexible de CORS para producción y desarrollo
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : '*';

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// HTTP Security Headers (Defense-in-depth, OWASP & Apple/Google compliance)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=*, geolocation=*, microphone=()');
  next();
});

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Serve static uploads (evidence photos)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Health check endpoints para Nginx, balanceadores de carga y monitores de uptime
const healthHandler = (_req: express.Request, res: express.Response) => {
  res.json({
    status: 'ok',
    service: 'AguaTrack EPS Moyobamba API',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    volvoConnect: volvoConnectService.getStatus().enabled ? 'ACTIVE' : 'STANDBY',
  });
};

app.get('/health', healthHandler);
app.get('/api/v1/health', healthHandler);

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/beneficiarios', beneficiariosRoutes);
app.use('/api/v1/entregas', entregasRoutes);
app.use('/api/v1/programaciones', programacionesRoutes);
app.use('/api/v1/cisternas', cisternasRoutes);
app.use('/api/v1/personal', personalRoutes);
app.use('/api/v1/sectores', sectoresRoutes);
app.use('/api/v1/sync', syncRoutes);
app.use('/api/v1/calidad', calidadRoutes);
app.use('/api/v1/informes', informesRoutes);
app.use('/api/v1/balance', balanceRoutes);
app.use('/api/v1/configuracion', configuracionRoutes);
app.use('/api/v1/usuarios', usuariosRoutes);
app.use('/api/v1', valesRoutes);

app.get('/', (req, res) => {
  res.send('Agua Móvil API is running - EPS Moyobamba');
});

const server = app.listen(port, () => {
  console.log(`🚀 Servidor ejecutándose en el puerto ${port} [Modo: ${process.env.NODE_ENV || 'development'}]`);
  bootstrapSuperAdmin();

  // Iniciar sincronización de Volvo Connect si está habilitado
  const syncInterval = parseInt(process.env.VOLVO_CONNECT_SYNC_INTERVAL_MS || '120000', 10);
  volvoConnectService.startBackgroundSync(syncInterval);
});

// Cierre elegante (Graceful Shutdown) para PM2 y contenedores Docker
const handleShutdown = async (signal: string) => {
  console.log(`🛑 Señal ${signal} recibida. Cerrando conexiones de manera ordenada...`);
  volvoConnectService.stopBackgroundSync();
  server.close(async () => {
    try {
      await pool.end();
      console.log('✅ Pool de base de datos cerrado. Proceso terminado con éxito.');
      process.exit(0);
    } catch (err) {
      console.error('Error cerrando pool de base de datos:', err);
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
