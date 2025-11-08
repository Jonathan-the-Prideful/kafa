import express from 'express';
import availabilityRouter from './routes/availability.js';
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send('Hello world!');
});

app.use('/api/availability', availabilityRouter);

// simple healthcheck
app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
