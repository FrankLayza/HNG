# HNG Stage 1 - Data Persistence & API Design

A backend service built with Express.js, TypeScript, and Prisma that aggregates data from external APIs (Genderize, Agify, Nationalize) and stores the results under a unified profile system. 

## Features

- **Multi-API Integration**: Combines gender prediction, age estimation, and nationality classification into a single creation request.
- **Data Persistence**: Stores aggregated profiles in a PostgreSQL database using Prisma ORM.
- **Idempotency**: Prevents duplicate profile creation.
- **Filtering Logic**: Allows case-insensitive filtering by gender, country ID, and age group.
- **UUID v7**: Uses chronological UUID v7 for sequential and collision-free primary keys.

## Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Validation**: Zod

## API Endpoints

### 1. Create Profile
**URL**: `/api/profiles`
**Method**: `POST`
**Body**:
```json
{ "name": "ella" }
```

**Success Response (201 Created)**:
```json
{
  "status": "success",
  "data": {
    "id": "b3f9c1e2-7d4a-4c91-9c2a-1f0a8e5b6d12",
    "name": "ella",
    "gender": "female",
    "gender_probability": 0.99,
    "sample_size": 1234,
    "age": 46,
    "age_group": "adult",
    "country_id": "DRC",
    "country_probability": 0.85,
    "created_at": "2026-04-01T12:00:00.000Z"
  }
}
```
*(Returns 200 OK if the profile already exists)*

### 2. Get Single Profile
**URL**: `/api/profiles/{id}`
**Method**: `GET`
**Response (200 OK)**: Full profile data, identical to the Create response format.

### 3. Get All Profiles
**URL**: `/api/profiles`
**Method**: `GET`
**Query Parameters (Optional, Case-Insensitive)**:
- `gender` (e.g. male, female)
- `country_id` (e.g. NG, US)
- `age_group` (e.g. child, teenager, adult, senior)

**Success Response (200 OK)**:
```json
{
  "status": "success",
  "count": 1,
  "data": [
    {
      "id": "b3f9c1e2-7d4a-4c91-9c2a-1f0a8e5b6d12",
      "name": "ella",
      "gender": "female",
      "age": 46,
      "age_group": "adult",
      "country_id": "DRC"
    }
  ]
}
```

### 4. Delete Profile
**URL**: `/api/profiles/{id}`
**Method**: `DELETE`
**Success Response**: 204 No Content

## Error Responses

- **400 Bad Request**: Missing or empty name parameter.
- **422 Unprocessable Entity**: Invalid type (e.g. name is not a string).
- **404 Not Found**: Profile not found for GET/DELETE operations.
- **502 Bad Gateway**: `{ "status": "error", "message": "<API_NAME> returned an invalid response" }`

## Setup Instructions

1. **Clone the repository**:
   ```bash
   git clone <repo-url>
   cd stage-zero
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Configure Environment**:
   Create a `.env` file:
   ```env
   PORT=3110
   DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
   ```

4. **Initialize Database**:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Run the server**:
   ```bash
   pnpm dev
   ```

---
Built for the HNG Stage 1 Backend Task.
