# Insighta Labs+ Backend (Stage 3)

The core API engine for the **Insighta Labs+** intelligence platform. This repository provides a secure, role-based REST API that powers both the Web Portal and the globally installable CLI tool.

## System Architecture

The Insighta Labs+ ecosystem follows a **Three-Interface/One-Backend** pattern:

1.  **Backend (This repo)**: A high-performance Express.js API using Prisma ORM and PostgreSQL.
2.  **Web Portal**: A Next.js 16 dashboard using HTTP-only cookies for session management.
3.  **CLI Tool**: A globally installable command-line interface that stores credentials at `~/.insighta/credentials.json`.

### Core Layers:
-   **Security Layer**: GitHub OAuth with PKCE (S256), JWT access/refresh token rotation, and CSRF protection.
-   **Intelligence Layer**: Natural Language Query (NLQ) parsing for profile analysis.
-   **Observability Layer**: Automated request logging and audit trails for all administrative actions.
-   **Guard Layer**: Rate limiting (1000 req/15min global, 10 req/15min on auth) and Role-Based Access Control (RBAC).

## Authentication Flow (GitHub OAuth + PKCE)

The backend implements the **Proof Key for Code Exchange (PKCE)** flow to secure both browser and CLI logins:

1.  **Authorization Request**: The client (Web or CLI) navigates to `GET /auth/github`. The server generates a `state` and `code_challenge` (SHA256), stores them server-side, and issues a **302 redirect** to GitHub's authorization page.
2.  **GitHub Login**: User authenticates with GitHub. GitHub redirects back to `GET /auth/github/callback?code=...&state=...`.
3.  **Token Exchange**: The server validates the `state` parameter against the stored entry, then exchanges the authorization `code` with GitHub for an access token.
4.  **User Resolution**: The server fetches the authenticated user's GitHub profile and email. If the user doesn't exist locally, they are created — the **first user** is assigned the `ADMIN` role, all subsequent users receive `ANALYST`.
5.  **Session Creation**: The backend generates a short-lived **Access Token** (15 min JWT) and a long-lived **Refresh Token** (7 day, stored in DB), returned as JSON.

## Token Handling Approach

-   **Access Tokens**: Stateless JWTs containing `userId` and `role`. Verified on every request via the `Authorization: Bearer <token>` header.
-   **Refresh Tokens**: Stored in the database. Used to obtain new access tokens via `POST /auth/refresh`.
-   **Rotation & Revocation**: Every refresh request rotates the refresh token. Admins can revoke all active sessions globally.
-   **Logout**: `POST /auth/logout` with a `refresh_token` in the body revokes the token immediately.

## Role Enforcement Logic

-   **ANALYST**: Default role. Can create profiles, list profiles, and use Natural Language Search.
-   **ADMIN**: First user auto-gets ADMIN. Inherits all Analyst permissions plus profile deletion, CSV export, user management, session revocation, and audit log viewing.

## Rate Limiting

-   **Global**: 1000 requests per 15-minute window per IP address.
-   **Auth endpoints** (`/auth/github`): Strict 10 requests per 15-minute window — returns `429 Too Many Requests` when exceeded.

---

## API Reference

### Authentication
-   `GET /auth/github`: 302 redirect to GitHub OAuth with PKCE.
-   `GET /auth/github/callback?code=...&state=...`: Exchange code for tokens.
-   `POST /auth/github/callback`: Exchange code + state for tokens (JSON body).
-   `POST /auth/refresh`: Rotate refresh token.
-   `POST /auth/logout`: Revoke refresh token.

### User
-   `GET /api/users/me`: Get current authenticated user's profile.

### Profiles (Analyst+)
-   `GET /api/profiles`: List profiles with filters/pagination.
-   `POST /api/profiles`: Create profile.
-   `GET /api/profiles/:id`: Get profile by ID.
-   `DELETE /api/profiles/:id`: (Admin) Delete profile.
-   `GET /api/profiles/export`: (Admin) CSV export.

### Administration (Admin Only)
-   `GET /api/admin/users`: List users.
-   `PATCH /api/admin/users/:id/role`: Update role.
-   `GET /api/admin/sessions`: List sessions.
-   `DELETE /api/admin/sessions/:id`: Revoke session.
-   `GET /api/admin/audit-logs`: View audit logs.

---

## Setup & Deployment

1.  `pnpm install`
2.  `npx prisma db push`
3.  Create `.env` based on `.env.example`
4.  `pnpm dev`
