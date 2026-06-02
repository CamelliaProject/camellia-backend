import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import pool from './config/db.js';
import plantationRoutes from './routes/plantationRoutes.js';
import experienceRoutes from './routes/experienceRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import userRoutes from './routes/userRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import plantationRequestRoutes from './routes/plantationRequestRoutes.js';
import authRoutes from './routes/authRoutes.js';
import { startCronJobs } from './services/cronService.js';
import contactRoutes from './routes/contactRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Limit admin login to 10 attempts per IP per 15 minutes
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(express.json());

app.use('/api/plantations', plantationRoutes);
app.use('/api/experiences', experienceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/plantation-requests', plantationRequestRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/auth/admin-login', adminLoginLimiter);
app.use('/api/auth', authRoutes);

app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        message: 'Camellia API is running smoothly using ES Modules!'
    });
});

// TEST DATABASE CONNECTION ON BOOT
try {
    const res = await pool.query('SELECT NOW()');
    console.log(`Database connection verified. Current time from DB: ${res.rows[0].now}`);
} catch (err) {
    console.error(' Database connection error:', err.message);
}

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    startCronJobs();
});