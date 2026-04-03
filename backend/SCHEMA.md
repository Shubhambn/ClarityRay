# Database Schema

ClarityRay uses a JSON-backed store for local development (`backend/data/db.json`).
The schema below represents the production-ready relational model.

## Users

- `id` (UUID, PK)
- `name` (string, required)
- `email` (string, unique, indexed)
- `passwordHash` (string, required)
- `preferences` (JSON)
  - `showDisclaimerAlways` (boolean)
  - `saveLocalHistory` (boolean)
  - `enableDesktopNotifications` (boolean)
- `createdAt` (datetime)
- `updatedAt` (datetime)

## AnalysisJobs

- `id` (UUID, PK)
- `userId` (UUID, FK -> Users.id)
- `status` (enum: `processing | completed | failed`)
- `fileName` (string)
- `filePath` (string)
- `mimeType` (string)
- `fileSize` (number)
- `resultId` (UUID, nullable, FK -> Results.id)
- `createdAt` (datetime)
- `updatedAt` (datetime)
- `completedAt` (datetime, nullable)

## Results

- `id` (UUID, PK)
- `jobId` (UUID, FK -> AnalysisJobs.id, unique)
- `userId` (UUID, FK -> Users.id)
- `confidence` (decimal)
- `explanation` (text)
- `metadata` (JSON)
- `disclaimer` (text)
- `heatmapUrl` (string, nullable)
- `createdAt` (datetime)
- `updatedAt` (datetime)

## Relationships

- `Users (1) -> (N) AnalysisJobs`
- `Users (1) -> (N) Results`
- `AnalysisJobs (1) -> (0..1) Results`
