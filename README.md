# Permit SDR v3

AI-powered permit tracking and sales development platform for construction opportunities in the DC/Maryland area.

## Overview

This platform automatically scrapes permit data from multiple jurisdictions, scores opportunities using AI, and presents them through an intuitive dashboard for sales development teams.

### Jurisdictions Supported

- **Howard County, MD** - Building permits from DILP Citizen Access
- **Baltimore County, MD** - Permits from Citizen Access portal
- **Anne Arundel County, MD** - Permits from Accela portal
- **Washington, DC** - Permits from DC Citizen Access

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Playwright    │────>│    Supabase     │<────│    Dashboard    │
│   Scrapers      │     │   (Database)    │     │   (Netlify)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        v                       v
┌─────────────────┐     ┌─────────────────┐
│  GitHub Actions │     │   OpenAI API    │
│  (Scheduled)    │     │  (AI Scoring)   │
└─────────────────┘     └─────────────────┘
```

## Project Structure

```
permit-sdr-v3/
├── scraper/                 # Playwright scrapers
│   ├── src/
│   │   ├── scrapers/        # Individual jurisdiction scrapers
│   │   ├── utils/           # Browser, DB, AI utilities
│   │   └── types/           # TypeScript types
│   └── package.json
├── dashboard/               # React dashboard (Vite + Tailwind)
│   ├── src/
│   │   ├── components/      # UI components
│   │   ├── pages/           # Page components
│   │   ├── hooks/           # React Query hooks
│   │   └── lib/             # Supabase client
│   └── package.json
├── shared/                  # Shared types and constants
├── supabase/
│   └── migrations/          # Database schema
└── .github/
    └── workflows/           # GitHub Actions
```

## Setup

### Prerequisites

- Node.js 20+
- npm
- Supabase account
- OpenAI API key
- Netlify account (for dashboard deployment)

### 1. Clone and Install

```bash
git clone <repository-url>
cd permit-sdr-v3
npm install
```

### 2. Database Setup

1. Create a new Supabase project
2. Run the migration in `supabase/migrations/001_initial_schema.sql`
3. Copy your Supabase URL and keys

### 3. Environment Variables

**Scraper** (`scraper/.env`):
```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
OPENAI_API_KEY=your_openai_api_key
```

**Dashboard** (`dashboard/.env`):
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. GitHub Secrets

Add these secrets to your GitHub repository:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`
- `NETLIFY_AUTH_TOKEN`
- `NETLIFY_SITE_ID`

## Usage

### Running Scrapers Locally

```bash
# Run all scrapers
npm run scrape

# Run specific jurisdiction
npm run scrape:howard
npm run scrape:baltimore
npm run scrape:aaco
npm run scrape:dc

# Run with AI scoring
cd scraper && npx tsx src/index.ts --score
```

### Running Dashboard Locally

```bash
npm run dev
# Dashboard available at http://localhost:5173
```

### Building for Production

```bash
npm run build
```

## Features

### Scraper
- Automated Playwright-based scraping
- Handles pagination and dynamic content
- Stores raw data for debugging
- Duplicate detection via permit number

### AI Scoring
- GPT-4 powered opportunity analysis
- Scores on multiple dimensions:
  - Project size
  - Timing relevance
  - Location desirability
  - Competition level
- Provides actionable recommendations

### Dashboard
- Real-time permit data
- Filter by jurisdiction, project type, rating
- Full-text search
- Score breakdowns and AI insights
- Responsive design

## GitHub Actions

### Scrape Workflow (`scrape.yml`)
- Runs daily at 6 AM UTC
- Can be triggered manually
- Supports single jurisdiction runs
- Optional AI scoring

### Deploy Workflow (`deploy.yml`)
- Deploys on push to main
- Only triggers on dashboard/shared changes
- Deploys to Netlify

## API Endpoints (Supabase)

The dashboard uses these Supabase views:
- `permits_with_scores` - Permits joined with AI scores
- `dashboard_stats` - Aggregated statistics

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes
4. Submit a pull request

## License

Private - All rights reserved
