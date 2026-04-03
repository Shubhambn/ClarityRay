# API Reference

Base URL: `http://localhost:4000/api`

## Auth

### `POST /auth/signup`
Create an account.

Body:
```json
{
  "name": "Dr. Priya Sharma",
  "email": "priya@clinic.org",
  "password": "strong-password"
}
```

### `POST /auth/login`
Sign in and receive a JWT token.

Body:
```json
{
  "email": "priya@clinic.org",
  "password": "strong-password"
}
```

## Analysis

### `POST /analysis/upload`
Upload a scan file and create an async analysis job.

- Auth: `Bearer <token>`
- FormData field: `scan`

Returns `202` with job details.

### `GET /analysis/:id`
Get one analysis job and result when available.

- Auth: `Bearer <token>`

### `GET /analysis/history`
List current user's analysis history.

- Auth: `Bearer <token>`

## User

### `GET /user/profile`
Fetch current user profile.

- Auth: `Bearer <token>`

### `PUT /user/settings`
Update name and/or preferences.

- Auth: `Bearer <token>`

Body:
```json
{
  "name": "Dr. Priya Sharma",
  "preferences": {
    "showDisclaimerAlways": true,
    "saveLocalHistory": true,
    "enableDesktopNotifications": false
  }
}
```
