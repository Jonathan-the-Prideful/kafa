import express from 'express';
import { db } from '../database.js';

const router = express.Router();

/**
 * Sanitize string input to prevent injection attacks.
 * Removes dangerous characters and SQL keywords.
 * @param {string} str - Input string
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Sanitized string
 */
function sanitizeString(str, maxLength = 45) {
    if (typeof str !== 'string') return '';
    let s = str.trim();
    // Remove individual dangerous characters: semicolon, hash, backslash
    s = s.replace(/[;#\\]/g, '');
    // Remove common single-quote variants (curly quotes, prime, straight single quote)
    s = s.replace(/[\u2018\u2019\u201A\u201B\u2032\u0027]/g, '');
    // Remove SQL comment tokens and block comments
    s = s.replace(/--/g, '');
    s = s.replace(/\/\*[\s\S]*?\*\//g, '');
    // Remove a small blacklist of SQL keywords (case-insensitive)
    s = s.replace(/\b(SELECT|UNION|DROP|INSERT|DELETE|UPDATE)\b/ig, '');
    // Collapse multiple whitespace to a single space and trim again
    s = s.replace(/\s+/g, ' ').trim();
    return s.substring(0, maxLength);
}

/**
 * Sanitize and validate email.
 * @param {string} email - Email address
 * @returns {string} Sanitized email
 * @throws {Error} If email format is invalid
 */
function sanitizeEmail(email) {
    const trimmed = sanitizeString(email, 45);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
        throw new Error('Invalid email format');
    }
    return trimmed;
}

/**
 * Sanitize and validate phone number.
 * @param {string} phone - Phone number
 * @returns {string} Sanitized phone number
 * @throws {Error} If phone format is invalid
 */
function sanitizePhone(phone) {
    const trimmed = sanitizeString(phone, 20);
    // Remove all non-digit characters for validation
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (digitsOnly.length < 10 || digitsOnly.length > 15) {
        throw new Error('Invalid phone number: must be 10-15 digits');
    }
    return trimmed;
}

/**
 * Sanitize and validate datetime.
 * @param {string} datetime - ISO datetime string
 * @returns {Date} Validated Date object
 * @throws {Error} If datetime is invalid
 */
function sanitizeDatetime(datetime) {
    if (!datetime) throw new Error('Datetime is required');
    const dt = new Date(datetime);
    if (isNaN(dt.getTime())) {
        throw new Error('Invalid datetime format');
    }
    return dt;
}

/**
 * GET /api/booking/check-duplicate
 * 
 * Check if a user already has a reservation that overlaps with the requested datetime.
 * Reservations are 2 hours long.
 * 
 * Query parameters:
 * - email: user@example.com (optional, but must provide email or phone)
 * - phone: 5555555555 (optional, but must provide email or phone)
 * - datetime: 2025-07-25T19:00:00 (required)
 * 
 * Response:
 * {
 *   "duplicate": false
 * }
 * 
 * OR if duplicate found:
 * {
 *   "duplicate": true,
 *   "matchedBy": "email" | "phone",
 *   "conflictingReservation": {
 *     "reservation_id": 123,
 *     "datetime": "2025-07-25T18:30:00",
 *     "guests": 4,
 *     "area_id": 2
 *   }
 * }
 */
router.get('/check-duplicate', async (req, res) => {
    try {
        const { email, phone, datetime } = req.query;

        // Validate input
        if (!datetime) {
            return res.status(400).json({ error: 'Missing required field: datetime' });
        }

        if (!email && !phone) {
            return res.status(400).json({ error: 'Must provide at least email or phone' });
        }

        // Sanitize and validate inputs
        let sanitizedEmail = '';
        let sanitizedPhone = '';

        try {
            if (email) {
                sanitizedEmail = sanitizeEmail(email);
            }
            if (phone) {
                sanitizedPhone = sanitizePhone(phone);
            }
        } catch (validationErr) {
            return res.status(400).json({ error: validationErr.message });
        }

        // Parse and validate requested datetime
        let requestedStart;
        try {
            requestedStart = sanitizeDatetime(datetime);
        } catch (validationErr) {
            return res.status(400).json({ error: validationErr.message });
        }

        // Calculate requested reservation end (2 hours later)
        const requestedEnd = new Date(requestedStart.getTime() + 2 * 60 * 60 * 1000);

        // Build SQL to find user and their reservations
        // Find user by email or phone, then check their reservations for overlap
        // Use prepared statements with sanitized inputs
        const sql = `
      SELECT 
        r.reservation_id,
        r.datetime,
        r.guests,
        r.area_id,
        u.email,
        u.phone_number
      FROM reservations r
      INNER JOIN users u ON r.user_id = u.user_id
      WHERE (u.email = ? OR u.phone_number = ?)
      ORDER BY r.datetime DESC
    `;

        const [reservations] = await db.execute(sql, [sanitizedEmail || '', sanitizedPhone || '']);

        // Check each reservation for overlap
        for (const reservation of reservations) {
            const resStart = new Date(reservation.datetime);
            const resEnd = new Date(resStart.getTime() + 2 * 60 * 60 * 1000); // +2 hours

            // Check if reservations overlap
            // Two reservations overlap if: resStart < requestedEnd AND resEnd > requestedStart
            if (resStart < requestedEnd && resEnd > requestedStart) {
                // Found overlapping reservation
                // Determine which field matched (use sanitized values for comparison)
                const matchedBy = (sanitizedEmail && reservation.email === sanitizedEmail) ? 'email' : 'phone';

                return res.json({
                    duplicate: true,
                    matchedBy: matchedBy,
                    conflictingReservation: {
                        reservation_id: reservation.reservation_id,
                        datetime: reservation.datetime,
                        guests: reservation.guests,
                        area_id: reservation.area_id
                    }
                });
            }
        }

        // No overlapping reservation found
        res.json({ duplicate: false });

    } catch (err) {
        console.error('Error checking duplicate booking:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
