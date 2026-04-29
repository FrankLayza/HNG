# Insighta Labs+ Backend (Stage 3)

Secure Access & Multi-Interface Integration for the Profile Intelligence System.

## System Architecture

The Insighta Labs+ ecosystem consists of:
1.  **Backend (This repo)**: Node.js/Express API with Prisma ORM and PostgreSQL.
2.  **Web Portal**: Next.js application (separate repo).
3.  **CLI Tool**: Globally installable Node.js command-line tool (separate repo).

Everything communicates via the `v1` REST API, secured with JWTs and GitHub OAuth.

## Authentication Flow (GitHub OAuth + PKCE)

We implement a secure OAuth flow that supports both browser-based and headless/CLI environments:

1.  **Authorization**: The client (CLI or Web) generates a PKCE `code_verifier` and `code_challenge`. It redirects the user to `/api/v1/auth/github/url`.
2.  **Callback**: GitHub redirects back with a `code`. The client sends this `code` along with the `code_verifier` to `POST /api/v1/auth/github/callback`.
3.  **Token Exchange**: The backend exchanges the code/verifier with GitHub, fetches the user's identity, and creates/updates a local `User` record.
4.  **Session Issuance**: The backend issues a short-lived **Access Token** (15m) and a long-lived **Refresh Token** (7d).

## Token Handling Approach

-   **Access Tokens**: Short expiry (15m). Carries `userId` and `role`. Must be sent in the `Authorization: Bearer <token>` header.
-   **Refresh Tokens**: Long expiry (7d). Stored in the database and used to rotate credentials.
-   **Rotation**: When a refresh token is used, it is revoked, and a new refresh token/access token pair is issued.

## Role Enforcement Logic

We use a Role-Based Access Control (RBAC) middleware:
-   **ANALYST**: Can search, filter, and view profiles.
-   **ADMIN**: Inherits Analyst permissions plus **Delete** and **CSV Export** capabilities.
-   **First User Rule**: The first user to log in via GitHub is automatically granted the `ADMIN` role. Subsequent users are `ANALYST` by default.

## Natural Language Parsing (NLQ)

The system retains its Stage 2 "Intelligence":
-   Parses queries like "men from Nigeria above 30" or "young women in US".
-   Extracts gender, age ranges, age groups, and country codes using regex and the `i18n-iso-countries` library.
-   The parsed tokens are seamlessly merged with standard pagination and filtering parameters.

## API Usage

### Auth Endpoints
-   `GET /api/v1/auth/github/url`: Get GitHub auth URL.
-   `POST /api/v1/auth/github/callback`: Finalize login (send `code` and `code_verifier`).
-   `POST /api/v1/auth/refresh`: Get new tokens (send `refresh_token`).

### Profile Endpoints
-   `GET /api/v1/profiles`: List profiles (Requires Analyst+).
-   `GET /api/v1/profiles/search?q=...`: Natural language search (Requires Analyst+).
-   `GET /api/v1/profiles/:id`: Get profile details (Requires Analyst+).
-   `POST /api/v1/profiles`: Create profile (Requires Analyst+).
-   `DELETE /api/v1/profiles/:id`: Delete profile (Requires Admin).
-   `GET /api/v1/profiles/export`: Export as CSV (Requires Admin).

## Setup

1.  Clone the repo and run `pnpm install`.
2.  Set up your `.env`:
    ```env
    DATABASE_URL="postgresql://..."
    GITHUB_CLIENT_ID="your_id"
    GITHUB_CLIENT_SECRET="your_secret"
    GITHUB_REDIRECT_URI="http://localhost:3000/callback"
    JWT_SECRET="your_jwt_secret"
    JWT_REFRESH_SECRET="your_refresh_secret"
    PORT=3000
    ```
3.  Generate Prisma client: `pnpm prisma generate`.
4.  Run migrations: `pnpm prisma db push`.
5.  Start server: `pnpm dev`.
