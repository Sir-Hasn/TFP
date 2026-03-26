# The Filipino Plate

A Filipino recipe platform with authentication, role-based admin controls, recipe search, bookmarks, cooking history, and Gemini-powered suggestions.

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Start MongoDB

On Windows (service install):

```powershell
net start MongoDB
```

### 3. Run the app

```bash
npm run start
```

For development with auto-restart:

```bash
npm run dev
```

### 4. Seed admin account (optional)

```bash
npm run seed:admin
```

## Scripts

- `npm run start` - Run backend server
- `npm run dev` - Run backend server with nodemon
- `npm run test` - Run smoke tests
- `npm run seed:admin` - Create or update admin user

## Smoke Tests

Run:

```bash
npm run test
```

Current smoke coverage:
- npm scripts are configured
- MongoDB connection uses env URI and avoids deprecated options

## Defense Checklist (Local Demo)

1. Start MongoDB.
2. Start server with `npm run start`.
3. Clear browser local storage before login tests.
4. Login as user and as admin to verify role-based navigation.
5. Verify protected endpoints with a fresh token.

## Security Notes (Current)

- Secrets are environment-based (`.env` locally).
- JWT-based authentication and role checks are enabled.
- Admin actions are audit logged.

Planned hardening after defense:
- centralized request validation for all mutation routes
- rate limiting on auth endpoints
- output sanitization in admin rendering
