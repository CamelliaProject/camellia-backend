# Camellia Ceylon Platform — Backend

REST API for the Camellia Ceylon Platform. Handles plantation management, tourist bookings, payments, reviews, and user authentication.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (ES Modules) |
| Framework | Express.js |
| Database | PostgreSQL |
| Authentication | Firebase Admin SDK |
| Image Storage | Cloudinary |
| Payments | PayHere (sandbox + live) |
| Email | Nodemailer (Gmail) |
| Scheduling | node-cron |

---

## Project Structure

```
src/
├── config/
│   └── db.js                    # PostgreSQL connection pool
├── controllers/                 # Route handler logic
│   ├── adminController.js
│   ├── authController.js
│   ├── bookingController.js
│   ├── contactController.js
│   ├── experienceController.js
│   ├── paymentController.js
│   ├── plantationController.js
│   ├── plantationRequestController.js
│   ├── reviewController.js
│   └── userController.js
├── middleware/
│   └── authMiddleware.js        # Firebase token verification + role check
├── routes/                      # Express routers
├── services/
│   ├── cronService.js           # Scheduled background jobs
│   ├── emailService.js          # Transactional email templates
│   ├── firebaseAdmin.js         # Firebase Admin initialisation
│   ├── payhereService.js        # PayHere payment helpers
│   └── storageService.js        # Cloudinary upload helper
├── db/
│   ├── schema.sql               # Full database schema
│   └── seed.js                  # Super admin seed script
└── server.js                    # App entry point
```

---

## API Routes

| Prefix | Description | Auth |
|--------|-------------|------|
| `GET /api/health` | Server health check | Public |
| `/api/auth` | Admin login, password change | Mixed |
| `/api/users` | Firebase user sync | Public |
| `/api/plantations` | Browse & manage plantations | Mixed |
| `/api/experiences` | Plantation experiences & time slots | Protected |
| `/api/bookings` | Create & manage bookings | Protected |
| `/api/reviews` | Submit & view reviews | Mixed |
| `/api/payments` | PayHere payment initiation & confirmation | Protected |
| `/api/plantation-requests` | Apply & approve plantation registrations | Mixed |
| `/api/admin` | Super admin management | Super Admin |
| `/api/contact` | Contact form submissions | Protected |

---

## Environment Variables

Create a `.env` file in the project root:

```env
# PostgreSQL
DATABASE_URL=postgresql://postgres:<password>@localhost:5432/camelliadb

# Firebase Admin
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# PayHere
PAYHERE_SANDBOX=true
PAYHERE_MERCHANT_ID=
PAYHERE_MERCHANT_SECRET=
PAYHERE_APP_ID=
PAYHERE_APP_SECRET=

# Email (Gmail)
EMAIL_USER=camelliaceylonplatform@gmail.com
EMAIL_PASS=

# App
PORT=5000
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:5000

# Super Admin seed (used by src/db/seed.js only)
SUPER_ADMIN_USERNAME=
SUPER_ADMIN_PASSWORD=
SUPER_ADMIN_NAME=
SUPER_ADMIN_EMAIL=
```

---

## Getting Started

```bash
# Install dependencies
npm install

# Start development server with auto-reload (http://localhost:5000)
npm run dev

# Start production server
npm start
```

### Database Setup

```bash
# Create the database
createdb camelliadb

# Apply schema
psql -U postgres -d camelliadb -f src/db/schema.sql

# Seed super admin account
node src/db/seed.js
```

### Apply Migrations

```bash
psql -U postgres -d camelliadb -f migrations/<migration-file>.sql
```

---

## Authentication

All protected routes require a Firebase ID token in the `Authorization` header:

```
Authorization: Bearer <firebase-id-token>
```

Role-based access is enforced via the `checkRole` middleware. Available roles: `tourist`, `plantationadmin`, `superadmin`.

---

## Contact

**camelliaceylonplatform@gmail.com**
