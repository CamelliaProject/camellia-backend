# Camellia Ceylon Platform — Backend

REST API for the Camellia Ceylon Platform. Handles plantation management, tourist bookings, payments, reviews, and authentication.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (ES Modules) |
| Framework | Express.js |
| Database | PostgreSQL |
| Authentication | Firebase Admin SDK |
| Image Storage | Cloudinary |
| Payments | PayHere |
| Email | Nodemailer (Gmail) |
| Scheduling | node-cron |

---

## Features

- Plantation registration, approval, and management
- Tourist booking system with experience selection
- PayHere payment integration (booking & subscription payments)
- Review and reply system with image uploads
- Role-based access control (Tourist, Plantation Admin, Super Admin)
- Subscription management with automated renewal reminders
- Transactional emails for bookings, credentials, and notifications

---

## Project Structure

```
src/
├── config/         # Database connection
├── controllers/    # Route handler logic
├── middleware/     # Authentication & role-based access
├── routes/         # API route definitions
├── services/       # External integrations (Firebase, Cloudinary, PayHere, email, cron)
├── utils/          # Helper functions
├── db/             # Database schema and seed script
└── server.js       # Application entry point
```

---

## API Overview

| Prefix | Description |
|--------|-------------|
| `/api/auth` | Admin login, password management |
| `/api/users` | User sync |
| `/api/plantations` | Browse and manage plantations |
| `/api/experiences` | Plantation experiences and time slots |
| `/api/bookings` | Create and manage bookings |
| `/api/reviews` | Submit and view reviews |
| `/api/payments` | PayHere payment and subscription flows |
| `/api/plantation-requests` | Plantation registration requests |
| `/api/admin` | Super admin management |
| `/api/contact` | Contact form submissions |
| `/api/settings` | App settings (exchange rate) |

---

## Environment Variables

Create a `.env` file in the project root with the following keys:

```env
# PostgreSQL
DATABASE_URL=

# Firebase Admin SDK
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# PayHere
PAYHERE_SANDBOX=
PAYHERE_MERCHANT_ID=
PAYHERE_MERCHANT_SECRET=
PAYHERE_APP_ID=
PAYHERE_APP_SECRET=

# Email
EMAIL_USER=
EMAIL_PASS=

# App
PORT=
FRONTEND_URL=
BACKEND_URL=

# Super Admin Seed
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

# Start development server
npm run dev

# Start production server
npm start
```

### Database Setup

```bash
# Apply schema
psql -U <user> -d <database> -f src/db/schema.sql

# Seed super admin account
node src/db/seed.js
```

---

## Authentication

All protected routes require a Firebase ID token in the `Authorization` header:

```
Authorization: Bearer <firebase-id-token>
```

Tourists authenticate via Firebase Auth. Plantation Admins and Super Admins receive a Firebase Custom Token upon successful username/password login.
