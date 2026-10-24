# Habit & Goal Tracker (MERN)

Requires Node 18+ and a running MongoDB (local, or set MONGO_URI to an Atlas URL).

    cd server && cp .env.example .env && npm install && npm run dev   # API on :5000
    cd client && npm install && npm run dev                           # App on :5173


## AI Progress Analyzer

The Insights tab includes an optional AI-generated review of the signed-in user's recent habit history. To enable it, add `OPENAI_API_KEY` to `server/.env`. Optionally set `OPENAI_MODEL` (defaults to `gpt-4o-mini`). Never put the API key in the client or commit `.env`. The server sends aggregate habit completion, sleep/mood comparisons, and reflection trigger/category counts; reflection free-text notes are not sent.
