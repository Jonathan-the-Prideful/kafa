import { Server } from 'socket.io';
import { db } from './database.js';

export function initSocket() {
    const port = Number(process.env.SOCKET_PORT ?? 5001);
    const origins = [
        'http://localhost',
        'http://localhost:80'
    ];

    console.log(`[Socket] Initializing Socket.IO server on port ${port}`);
    console.log(`[Socket] CORS origins:`, origins);

    const io = new Server(port, {
        cors: {
            origin: origins,
            methods: ['GET', 'POST']
        }
    });

    console.log(`[Socket] Socket.IO server started successfully on port ${port}`);

    io.on('connection', (socket) => {
        console.log(`[Socket] User connected - ID: ${socket.id}, Total clients: ${io.engine.clientsCount}`);

        // handle reservation events emitted from clients
        socket.on('reservation:created', async (reservation, callback) => {
            console.log(`[Socket] Received reservation:created from ${socket.id}:`, {
                preferredArea: reservation?.preferredArea,
                datetime: reservation?.datetime,
                guests: reservation?.guests
            });
            try {
                // Create reservation FIRST and wait for it to complete
                await createReservation(reservation);

                // Only send success acknowledgement and broadcast AFTER successful DB write
                const ack = { ok: true };

                if (typeof callback === 'function') {
                    try { callback(ack); } catch (cbErr) { console.error('client ack callback error', cbErr); }
                }

                // emit server-side ack for any other listeners
                socket.emit('reservation:ack', ack);

                // Notify all connected clients that availability may have changed
                // This now happens AFTER the reservation is committed to DB
                refreshReservationsForClients(reservation, socket);
            } catch (err) {
                console.error('error handling reservation:created', err);
                const ack = { ok: false, error: String(err) };
                if (typeof callback === 'function') {
                    try { callback(ack); } catch (cbErr) { console.error('client ack callback error on failure', cbErr); }
                }
                socket.emit('reservation:ack', ack);
            }
        });

        socket.on('disconnect', () => {
            console.log(`[Socket] User disconnected - ID: ${socket.id}, Remaining clients: ${io.engine.clientsCount - 1}`);
        });
    });

    return io;

    function refreshReservationsForClients(reservation, socket) {
        try {
            const area = reservation && typeof reservation === 'object' ? reservation.preferredArea : null;
            const datetime = reservation && typeof reservation === 'object' ? reservation.datetime : null;
            const payload = { area: area ?? null, datetime: datetime ?? null };

            console.log('[Socket] Broadcasting reservations:refresh:', payload);
            socket.broadcast.emit('reservations:refresh', payload);
        } catch (emitErr) {
            console.error('[Socket] Error broadcasting reservations:refresh:', emitErr);
        }
    }

    /**
     * Sanitize and validate input data to prevent injection attacks and ensure data integrity.
     * @param {object} data - Raw reservation data
     * @returns {object} Sanitized data or throws error if invalid
     */
    function sanitizeReservationData(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid reservation data: must be an object');
        }

        // Sanitize string fields - trim whitespace, remove dangerous characters/tokens
        // and strip known SQL keywords. Keeps final length within maxLength.
        const sanitizeString = (str, maxLength = 45) => {
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
            // This is defensive only; prepared statements are still used for DB writes.
            s = s.replace(/\b(SELECT|UNION|DROP|INSERT|DELETE|UPDATE)\b/ig, '');
            // Collapse multiple whitespace to a single space and trim again
            s = s.replace(/\s+/g, ' ').trim();
            return s.substring(0, maxLength);
        };

        // Sanitize and validate email
        const sanitizeEmail = (email) => {
            const trimmed = sanitizeString(email, 45);
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(trimmed)) {
                throw new Error('Invalid email format');
            }
            return trimmed;
        };

        // Sanitize and validate phone number
        const sanitizePhone = (phone) => {
            const trimmed = sanitizeString(phone, 20);
            // Remove all non-digit characters for validation
            const digitsOnly = trimmed.replace(/\D/g, '');
            if (digitsOnly.length < 10 || digitsOnly.length > 15) {
                throw new Error('Invalid phone number: must be 10-15 digits');
            }
            return trimmed;
        };

        // Sanitize datetime - ensure it's a valid ISO string or MySQL datetime
        const sanitizeDatetime = (datetime) => {
            if (!datetime) throw new Error('Datetime is required');
            const dt = new Date(datetime);
            if (isNaN(dt.getTime())) {
                throw new Error('Invalid datetime format');
            }
            // Return MySQL datetime format: YYYY-MM-DD HH:MM:SS
            return dt.toISOString().slice(0, 19).replace('T', ' ');
        };

        // Sanitize integer fields with min/max bounds
        const sanitizeInt = (value, min = 0, max = 12) => {
            const num = parseInt(value, 10);
            if (isNaN(num) || num < min || num > max) {
                throw new Error(`Invalid integer: must be between ${min} and ${max}`);
            }
            return num;
        };

        // Sanitize boolean fields
        const sanitizeBool = (value) => {
            return value ? 1 : 0;
        };

        // Map preferredArea to area_id
        const areaMap = {
            'MainHall': 1,
            'Bar': 2,
            'RiverSide': 3,
            'RiverSideSmoking': 4
        };

        const areaId = areaMap[data.preferredArea];
        if (!areaId) {
            throw new Error('Invalid preferred area');
        }

        return {
            name: sanitizeString(data.name, 45),
            email: sanitizeEmail(data.email),
            phone: sanitizePhone(data.phone),
            guests: sanitizeInt(data.guests, 1, 12),
            datetime: sanitizeDatetime(data.datetime),
            area_id: areaId,
            children: sanitizeInt(data.children, 0, 12),
            smoking: sanitizeBool(data.smoking),
            birthday: sanitizeBool(data.birthday),
            birthday_guest_name: data.birthdayGuestName ? sanitizeString(data.birthdayGuestName, 100) : null
        };
    }

    /**
     * Create a new reservation in the database using prepared statements.
     * First checks/creates user, then creates the reservation.
     * @param {object} reservation - Raw reservation data from client
     */
    async function createReservation(reservation) {
        let connection;
        try {
            // Sanitize input data
            const sanitized = sanitizeReservationData(reservation);

            connection = await db.getConnection();
            await connection.beginTransaction();

            // Step 1: Check if user exists by email or phone, or create new user
            const [existingUsers] = await connection.execute(
                'SELECT user_id FROM users WHERE email = ? OR phone_number = ? LIMIT 1',
                [sanitized.email, sanitized.phone]
            );

            let userId;
            if (existingUsers.length > 0) {
                userId = existingUsers[0].user_id;

                // Update user info if they exist
                await connection.execute(
                    'UPDATE users SET name = ?, email = ?, phone_number = ? WHERE user_id = ?',
                    [sanitized.name, sanitized.email, sanitized.phone, userId]
                );
            } else {
                // Create new user with prepared statement
                const [userResult] = await connection.execute(
                    'INSERT INTO users (name, email, phone_number) VALUES (?, ?, ?)',
                    [sanitized.name, sanitized.email, sanitized.phone]
                );
                userId = userResult.insertId;
            }

            // Step 2: Create reservation with prepared statement
            const [reservationResult] = await connection.execute(
                `INSERT INTO reservations 
                (user_id, guests, datetime, area_id, children, smoking, birthday, birthday_guest_name) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    sanitized.guests,
                    sanitized.datetime,
                    sanitized.area_id,
                    sanitized.children,
                    sanitized.smoking,
                    sanitized.birthday,
                    sanitized.birthday_guest_name
                ]
            );

            await connection.commit();
            console.log(`Reservation created successfully. ID: ${reservationResult.insertId}, User ID: ${userId}`);

            return {
                reservationId: reservationResult.insertId,
                userId: userId
            };
        } catch (err) {
            if (connection) {
                await connection.rollback();
            }
            console.error('Error creating reservation:', err);
            throw err;
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }
}

export default initSocket;
