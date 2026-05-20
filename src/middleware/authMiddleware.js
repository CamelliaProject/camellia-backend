import pool from '../config/db.js';
import admin from '../services/firebaseAdmin.js';

async function authenticate(req, res, next) {
	try {
		const authHeader = req.headers.authorization || req.headers.Authorization;
		if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
			return res.status(401).json({ error: 'Missing or malformed Authorization header' });
		}

		const idToken = authHeader.split(' ')[1];
		let decoded;
		try {
			decoded = await admin.auth().verifyIdToken(idToken);
		} catch (err) {
			console.error('Firebase token verification failed:', err);
			return res.status(401).json({ error: 'Invalid or expired token' });
		}

		const uid = decoded.uid;
		const email = decoded.email || null;

		const query = `
			SELECT id, uid, email, name, role, created_at, updated_at
			FROM users
			WHERE uid = $1 OR ($2 IS NOT NULL AND email = $2)
			LIMIT 1
		`;

		const values = [uid, email];
		const { rows } = await pool.query(query, values);

		if (!rows || rows.length === 0) {
			return res.status(401).json({ error: 'User not found in local database' });
		}

		const user = rows[0];
		req.user = user;
		return next();
	} catch (err) {
		console.error('Authentication middleware error:', err);
		return res.status(500).json({ error: 'Internal server error' });
	}
}

function checkRole(...allowedRoles) {
	return (req, res, next) => {
		if (!req.user) {
			return res.status(401).json({ error: 'No authenticated user found on request' });
		}

		const userRole = req.user.role;
		if (!userRole || !allowedRoles.includes(userRole)) {
			return res.status(403).json({ error: 'Forbidden' });
		}

		return next();
	};
}

export { authenticate, checkRole };

