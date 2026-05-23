import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './config/db.js';
import plantationRoutes from './routes/plantationRoutes.js';
import experienceRoutes from './routes/experienceRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import userRoutes from './routes/userRoutes.js';
import resourceRoutes from './routes/resourceRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
}));
app.use(express.json());

app.use('/api/plantations', plantationRoutes);
app.use('/api/experiences', experienceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/resources', resourceRoutes);

app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        message: 'Camellia API is running smoothly using ES Modules!'
    });
});

// TEST DATABASE CONNECTION ON BOOT
try {
    const res = await pool.query('SELECT NOW()');
    console.log(`s Database connection verified! Current time from DB: ${res.rows[0].now}`);
} catch (err) {
    console.error(' Database connection error:', err.message);
}

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});