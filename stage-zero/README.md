# HNG Stage 0 - Name Classification API

A simple API that predicts the gender of a name using the Genderize API and returns a structured response with confidence levels.

## Features

- **Gender Prediction**: Integrates with [Genderize.io](https://genderize.io/) to determine gender.
- **Confidence Logic**: Provides a `is_confident` flag based on probability (>= 0.7) and sample size (>= 100).
- **CORS Enabled**: Supports Cross-Origin Resource Sharing for all origins.
- **Error Handling**: Standardized error responses (400, 422, 5xx).

## Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express.js
- **Tools**: tsx (for running), rate-limit (for stability)

## API Specification

### 1. Classify Name
Returns gender information for a given name.

**URL**: `/api/classify`
**Method**: `GET`
**Query Parameters**:
- `name` (string, required): The name to classify.

**Success Response (200 OK)**:
```json
{
  "status": "success",
  "data": {
    "name": "john",
    "gender": "male",
    "probability": 0.99,
    "sample_size": 1234,
    "is_confident": true,
    "processed_at": "2026-04-13T10:00:00Z"
  }
}
```

**Error Responses**:
- **400 Bad Request**: Missing or empty name parameter.
- **422 Unprocessable Entity**: Name is not a string.
- **500 Internal Server Error**: External API failure or server error.

**Error Format**:
```json
{
  "status": "error",
  "message": "<error message>"
}
```

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
   Create a `.env` file or use the provided one:
   ```env
   PORT=3000
   ```

4. **Run the server**:
   ```bash
   pnpm start
   ```

---
Built for the HNG Stage 0 Backend Task.
