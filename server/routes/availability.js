import express from 'express';
import { db } from '../database.js';

const router = express.Router();

/**
 * Basic sanitization for short text inputs (date strings here).
 * Removes dangerous characters and SQL keywords and enforces max length.
 */
function sanitizeString(str, maxLength = 45) {
  if (typeof str !== 'string') return '';
  let s = str.trim();
  s = s.replace(/[;#\\]/g, '');
  s = s.replace(/[\u2018\u2019\u201A\u201B\u2032\u0027]/g, '');
  s = s.replace(/--/g, '');
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/\b(SELECT|UNION|DROP|INSERT|DELETE|UPDATE)\b/ig, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s.substring(0, maxLength);
}

/**
 * Validate and sanitize a date string in YYYY-MM-DD format.
 * Returns the sanitized date string if valid, otherwise throws.
 */
function sanitizeDate(dateStr) {
  const s = sanitizeString(String(dateStr), 10);
  const match = /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!match) throw new Error('Invalid date format. Expected YYYY-MM-DD');
  const d = new Date(s);
  if (isNaN(d.getTime())) throw new Error('Invalid date');
  // Return YYYY-MM-DD portion to be used in SQL
  return s;
}

/**
 * Helper: Generate 30-minute time slots from 18:00 to 22:00
 * Returns array like: ['18:00', '18:30', '19:00', ..., '22:00']
 */
function generateTimeSlots() {
  const slots = [];
  for (let hour = 18; hour <= 22; hour++) {
    slots.push(`${hour}:00`);
    if (hour < 22) {
      slots.push(`${hour}:30`);
    }
  }
  return slots;
}

/**
 * Helper: Check if a reservation overlaps a given time slot.
 * Reservations are 2 hours long starting from their datetime.
 * 
 * @param {Date} reservationStart - Start datetime of reservation
 * @param {string} slotTime - Time slot string like '18:30'
 * @param {string} dateStr - Date string for the slot (YYYY-MM-DD)
 * @returns {boolean} - True if reservation overlaps this slot
 */
function reservationOverlapsSlot(reservationStart, slotTime, dateStr) {
  const reservationEnd = new Date(reservationStart.getTime() + 2 * 60 * 60 * 1000); // +2 hours

  const [hour, minute] = slotTime.split(':').map(Number);
  const slotStart = new Date(`${dateStr}T${slotTime}:00`);
  const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000); // +30 minutes

  // Check if reservation overlaps this slot
  return reservationStart < slotEnd && reservationEnd > slotStart;
}

/**
 * Helper: Calculate availability breakdown for a single area.
 * Returns map of time slots to available seats.
 * 
 * @param {object} area - Area object with capacity
 * @param {array} reservations - Array of reservations for this area on the target date
 * @param {string} dateStr - Target date string (YYYY-MM-DD)
 * @returns {object} - Map of time slots to { capacity, reserved, available }
 */
function calculateAreaAvailability(area, reservations, dateStr) {
  const slots = generateTimeSlots();
  const availability = {};

  slots.forEach(slot => {
    let reserved = 0;

    // Count how many guests are reserved during this slot
    reservations.forEach(res => {
      const resStart = new Date(res.datetime);
      if (reservationOverlapsSlot(resStart, slot, dateStr)) {
        reserved += res.guests;
      }
    });

    availability[slot] = {
      reserved: reserved,
      available: Math.max(0, area.capacity - reserved)
    };
  });

  return availability;
}

router.get('/', async (req, res) => {
  try {
    const rawDate = req.query.date;

    if (!rawDate) {
      return res.status(400).json({ error: 'Missing date query parameter (format: YYYY-MM-DD)' });
    }

    // Sanitize and validate the date parameter
    let date;
    try {
      date = sanitizeDate(rawDate);
    } catch (validationErr) {
      return res.status(400).json({ error: validationErr.message });
    }

    // Step 1: Get all areas
    const areasSql = `SELECT area_id, name, capacity, allows_children, allows_smoking FROM areas`;
    const [areas] = await db.execute(areasSql);

    // Step 2: For each area, get reservations for the given date
    // Reservations are 2 hours long, so we need to check reservations that:
    // - Start on the target date between 18:00 and 22:00, OR
    // - Start before the target date but could still overlap (within 2 hours)
    const reservationsSql = `
      SELECT r.reservation_id, r.area_id, r.guests, r.datetime, r.children, r.smoking
      FROM reservations r
      WHERE DATE(r.datetime) = DATE(?)
        AND TIME(r.datetime) >= '18:00:00'
        AND TIME(r.datetime) <= '22:00:00'
      ORDER BY r.area_id, r.datetime
    `;
    const [reservations] = await db.execute(reservationsSql, [date]);

    // Step 3: Build availability map for each area
    const result = areas.map(area => {
      const areaReservations = reservations.filter(r => r.area_id === area.area_id);
      const availability = calculateAreaAvailability(area, areaReservations, date);

      return {
        area_id: area.area_id,
        name: area.name,
        capacity: area.capacity,
        allows_children: Boolean(area.allows_children),
        allows_smoking: Boolean(area.allows_smoking),
        availability: availability
      };
    });

    res.json(result);

  } catch (err) {
    console.error('Error fetching availability:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

// Strategy to get availability:
// 1. Get all areas
// 2. For each area, get reservations for the given date
// Note: Reservations are 2 hours long.
// 3. Return areas with map of (capacity and reservation count broken down into 30 minute intervals) between 18:00 and 22:00 based on reservations found
