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
-   **Guard Layer**: Rate limiting (1000 req/15min) and Role-Based Access Control (RBAC).

## Authentication Flow (GitHub OAuth + PKCE)

The backend implements the **Proof Key for Code Exchange (PKCE)** flow to secure both browser and CLI logins:

1.  **Authorization Request**: The client (Web or CLI) generates a random `code_verifier` and a `code_challenge` (SHA256). It redirects the user to `/api/v1/auth/github/url`.
2.  **GitHub Login**: User authenticates with GitHub. GitHub redirects to the client's callback URI with an authorization `code`.
3.  **Token Exchange**: The client sends the `code` and the original `code_verifier` to `POST /api/v1/auth/github/callback`.
4.  **Verification**: The backend verifies the verifier against the challenge. If valid, it fetches the GitHub user identity.
5.  **Session Creation**: The backend creates a local User, generates a short-lived **Access Token** (15m), and a long-lived **Refresh Token** (7d).

## Token Handling Approach

-   **Access Tokens**: Stateless JWTs containing `userId` and `role`. Verified on every request via the `Authorization: Bearer` header.
-   **Refresh Tokens**: Stored in the database. Used to obtain new access tokens when they expire.
-   **Rotation & Revocation**: Every refresh request rotates the refresh token (the old one is revoked and a new one issued). This prevents replay attacks. Admins can revoke all active sessions for a user globally.

## Role Enforcement Logic

RBAC is enforced via middleware at the route level:

-   **ANALYST**: Default role. Can create profiles, list profiles, and use Natural Language Search.
-   **ADMIN**: High-privilege role. Inherits all Analyst permissions plus:
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

## CLI Interaction

The CLI tool interacts with the backend using a local callback server:
-   **Login**: The CLI starts a server on `http://localhost:9876`. After GitHub login, the backend redirects to this local port.
-   **Credential Storage**: Tokens are stored locally at `~/.insighta/credentials.json`.
-   **Auto-Refresh**: The CLI automatically detects expired access tokens and calls `/api/v1/auth/refresh` before retrying failed requests.

---

## API Reference

### Authentication
-   `GET /api/v1/auth/github/url`: Get auth URL with redirect_uri support.
-   `POST /api/v1/auth/github/callback`: Exchange code+verifier for tokens.
-   `POST /api/v1/auth/refresh`: Rotate refresh token and get new access token.

### Profiles (Analyst+)
-   `GET /api/v1/profiles`: List profiles with standard filters/pagination.
-   `GET /api/v1/profiles/search?q=...`: Natural language profile search.
-   `POST /api/v1/profiles`: Analyze name and create intelligence profile.
-   `DELETE /api/v1/profiles/:id`: (Admin Only) Purge a profile.
-   `GET /api/v1/profiles/export`: (Admin Only) Download full CSV export.

### Administration (Admin Only)
-   `GET /api/v1/admin/users`: List all users and their roles.
-   `PATCH /api/v1/admin/users/:id/role`: Update user role (ADMIN/ANALYST).
-   `GET /api/v1/admin/sessions`: List all active system sessions.
-   `DELETE /api/v1/admin/sessions/:id`: Revoke a specific session.
-   `GET /api/v1/admin/audit-logs`: View paginated system-wide audit trails.

---

## Setup & Deployment

1.  **Install**: `pnpm install`
2.  **Database**: `npx prisma db push` (Synchronizes schema without reset)
3.  **Environment**: Create `.env` based on `.env.example`.
4.  **Dev**: `pnpm dev`
