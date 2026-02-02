# LearnBot Frontend

Next.js frontend application for LearnBot.

## Setup

1. Install dependencies:
```bash
npm install
# or
pnpm install
```

2. Create `.env.local` file:
```bash
cp env.local.example .env.local
```

3. Update `.env.local` with your backend URL:
```bash
NEXT_PUBLIC_FLASK_API_URL=http://localhost:5000
```

4. Run development server:
```bash
npm run dev
# or
pnpm dev
```

The app will be available at http://localhost:3000

## Building for Production

```bash
npm run build
npm start
```

## Environment Variables

- `NEXT_PUBLIC_FLASK_API_URL` - URL of the Flask backend API

## Project Structure

- `app/` - Next.js app directory (pages and routes)
- `components/` - React components
- `lib/` - Frontend utilities and API client
- `public/` - Static assets

## Backend

The backend is in a separate repository: `LearnBot-Backend`

Make sure the backend is running before starting the frontend.
