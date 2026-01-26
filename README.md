# Permit SDR v3 - Clipper Construction

AI-powered permit tracking and sales development platform for commercial construction opportunities in the DC/Maryland area, built for Clipper Construction.

## Overview

This platform automatically scrapes permit data from multiple jurisdictions, filters for commercial construction opportunities relevant to general contractors, scores opportunities using Claude AI, and presents them through an intuitive dashboard.

### Jurisdictions Supported

- **Howard County, MD** - Building permits from DILP Citizen Access
- **Baltimore County, MD** - Permits from Citizen Access portal
- **Baltimore City, MD** - Building permits from Accela portal
- **Anne Arundel County, MD** - Permits from Accela portal
- **Washington, DC** - Permits from DC Citizen Access

### Filtering Logic

The system automatically filters out permits that are NOT relevant for Clipper Construction:
- Single-family residential projects
- Single trade permits (electrical only, plumbing only, HVAC only)
- Fire alarm/sprinkler-only permits
- Roofing-only projects
- Minor repairs and maintenance

It focuses on:
- Commercial tenant improvements and fit-outs
- Office renovations and buildouts
- Retail construction
- Medical/dental office buildouts
- Restaurant and hospitality construction
- Multi-family residential
- Ground-up commercial construction

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Playwright    │────>│    Supabase     │<────│    Dashboard    │
│   Scrapers      │     │   (Database)    │     │   (Netlify)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        v                       v
┌─────────────────┐     ┌─────────────────┐
│  GitHub Actions │     │  Anthropic API  │
│  (Scheduled)    │     │  (AI Scoring)   │
└─────────────────┘     └─────────────────┘
```

## Project Structure

```
permit-sdr-v3/
├── scraper/                 # Playwright scrapers
│   ├── src/
│   │   ├── scrapers/        # Individual jurisdiction scrapers
│   │   ├── utils/           # Browser, DB, AI, filtering utilities
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
- Anthropic API key
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
ANTHROPIC_API_KEY=your_anthropic_api_key
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
- `ANTHROPIC_API_KEY`
- `NETLIFY_AUTH_TOKEN`
- `NETLIFY_SITE_ID`

## Usage

### Running Scrapers Locally

```bash
# Run all scrapers
npm run scrape

# Run specific jurisdiction
npm run scrape:howard
npm run scrape:baltimore-county
npm run scrape:baltimore-city
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
- Smart filtering for commercial construction opportunities
- Handles pagination and dynamic content
- Stores raw data for debugging
- Duplicate detection via permit number

### AI Scoring (Claude)
- Anthropic Claude-powered opportunity analysis
- Customized for Clipper Construction's business
- Scores on multiple dimensions:
  - Project size and scope
  - Timing (permit status)
  - Location quality
  - Fit score (relevance to Clipper's expertise)
- Provides actionable recommendations for SDR follow-up

### Dashboard
- Real-time permit data
- Filter by jurisdiction, project type, rating
- Full-text search
- Score breakdowns and AI insights
- Recommended actions for each opportunity
- Responsive design

## GitHub Actions

### Scrape Workflow (`scrape.yml`)
- Runs daily at 6 AM UTC (1 AM EST)
- Can be triggered manually
- Supports single jurisdiction runs
- Optional AI scoring after scraping

### Deploy Workflow (`deploy.yml`)
- Deploys on push to main
- Only triggers on dashboard/shared changes
- Deploys to Netlify

## API Endpoints (Supabase)

The dashboard uses these Supabase views:
- `permits_with_scores` - Permits joined with AI scores
- `dashboard_stats` - Aggregated statistics

## License

Private - All rights reserved - Clipper Construction
