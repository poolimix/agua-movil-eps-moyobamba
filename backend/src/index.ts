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

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Serve static uploads (evidence photos)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

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
app.use('/api/v1', valesRoutes);


app.get('/', (req, res) => {
  res.send('Agua Móvil API is running - EPS Moyobamba');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
