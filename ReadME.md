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

### Alternative POST Callback
For SPA/CLI flows, `POST /auth/github/callback` is also available, accepting `{ code, state }` or `{ code, code_verifier }` in the request body.

## Token Handling Approach

-   **Access Tokens**: Stateless JWTs containing `userId` and `role`. Verified on every request via the `Authorization: Bearer <token>` header.
-   **Refresh Tokens**: Stored in the database. Used to obtain new access tokens when they expire via `POST /auth/refresh`.
-   **Rotation & Revocation**: Every refresh request rotates the refresh token (the old one is revoked and a new one issued). This prevents replay attacks. Admins can revoke all active sessions globally.
-   **Logout**: `POST /auth/logout` with a `refresh_token` in the body revokes the token immediately.

## Role Enforcement Logic

RBAC is enforced via middleware at the route level:

-   **ANALYST**: Default role for all users after the first. Can create profiles, list profiles, and use Natural Language Search.
-   **ADMIN**: High-privilege role (auto-assigned to the first registered user). Inherits all Analyst permissions plus:
    -   Deleting profiles.
    -   Exporting full profile datasets as CSV.
    -   Managing system users and roles.
    -   Revoking active sessions.
    -   Viewing system-wide Audit Logs.

*Note: The first user to register in the system is automatically granted the `ADMIN` role.*

## Natural Language Parsing (NLQ) Approach

The `parseNLQ` engine uses a sophisticated regex-based tokenizer to transform human intent into database filters:
1.  **Token Extraction**: Identifies gender keywords ("men", "female"), age numbers ("over 30", "25"), and locations ("Lagos", "Nigeria").
2.  **Entity Mapping**: Maps country names to ISO codes using `i18n-iso-countries`.
3.  **Range Conversion**: Converts phrases like "in their 20s" into explicit age ranges (`min_age=20`, `max_age=29`).
4.  **Query Synthesis**: The result is merged with the Prisma query builder to execute a single, optimized SQL query.

## Rate Limiting

-   **Global**: 1000 requests per 15-minute window per IP address.
-   **Auth endpoints** (`/auth/github`): Strict 10 requests per 15-minute window per IP — returns `429 Too Many Requests` when exceeded.

## CLI Interaction

The CLI tool interacts with the backend using a local callback server:
-   **Login**: The CLI starts a server on `http://localhost:9876`. After GitHub login, the backend redirects to this local port.
-   **Credential Storage**: Tokens are stored locally at `~/.insighta/credentials.json`.
-   **Auto-Refresh**: The CLI automatically detects expired access tokens and calls `/auth/refresh` before retrying failed requests.

---

## API Reference

### Authentication
-   `GET /auth/github`: Redirects (302) to GitHub OAuth with PKCE (code_challenge, state).
-   `GET /auth/github/callback?code=...&state=...`: Exchange authorization code for tokens.
-   `POST /auth/github/callback`: Exchange code + state/code_verifier for tokens (JSON body).
-   `GET /auth/github/url`: Get GitHub OAuth URL as JSON (legacy).
-   `POST /auth/refresh`: Rotate refresh token and get new access token.
-   `POST /auth/logout`: Revoke refresh token.

### User
-   `GET /api/users/me`: Get current authenticated user's profile.

### Profiles (Analyst+)
-   `GET /api/profiles`: List profiles with standard filters/pagination.
-   `GET /api/profiles/search?q=...`: Natural language profile search.
-   `POST /api/profiles`: Analyze name and create intelligence profile.
-   `GET /api/profiles/:id`: Get a single profile by ID.
-   `DELETE /api/profiles/:id`: (Admin Only) Purge a profile.
-   `GET /api/profiles/export`: (Admin Only) Download full CSV export.

### Administration (Admin Only)
-   `GET /api/admin/users`: List all users and their roles.
-   `PATCH /api/admin/users/:id/role`: Update user role (ADMIN/ANALYST).
-   `GET /api/admin/sessions`: List all active system sessions.
-   `DELETE /api/admin/sessions/:id`: Revoke a specific session.
-   `GET /api/admin/audit-logs`: View paginated system-wide audit trails.

---

## Setup & Deployment

1.  **Install**: `pnpm install`
2.  **Database**: `npx prisma db push` (Synchronizes schema without reset)
3.  **Environment**: Create `.env` based on `.env.example`.
4.  **Dev**: `pnpm dev`
5.  **Build**: `pnpm build`
6.  **Start**: `pnpm start`

### Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Server port (default: 3000) |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing access tokens |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |
| `GITHUB_REDIRECT_URI` | OAuth callback URL |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins |
