import express from 'express';
import { db } from '../database.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    // const { datetime } = req.query;

    // if (!datetime) {
    //     return res.status(400).json({ error: 'Missing datetime query parameter' });
    // }

    const sql = `SELECT * FROM kafeDatabase.areas;
    `;

    const [rows] = await db.execute(sql);
    res.json(rows);

  } catch (err) {
    console.error('Error fetching availability:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
