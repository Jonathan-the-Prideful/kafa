import express from 'express';
import availabilityRouter from './routes/availability.js';
import duplicateCheckRouter from './routes/duplicateBookingCheck.js';
import initSocket from './socketServer.js';
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 5000;

// Initialize Socket.IO via the socketServer module. Returns the io instance.
// Read configuration from environment (set via Docker Compose). If not provided,
// initSocket will fall back to its internal defaults.
const socketPort = process.env.SOCKET_PORT ? Number(process.env.SOCKET_PORT) : undefined;
const socketOrigins = process.env.SOCKET_ORIGINS ? process.env.SOCKET_ORIGINS.split(',') : undefined;
const io = initSocket({ port: socketPort, origins: socketOrigins });

// Allow CORS from the frontend
app.use((req, res, next) => {
    const allowedOrigins = ['http://localhost:80', 'http://localhost'];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send('Kafe Server is Live');
});

app.use('/api/availability', availabilityRouter);
app.use('/api/booking', duplicateCheckRouter);

// simple healthcheck
app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
