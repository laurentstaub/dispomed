# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm start` - Start the Express server on port 3000
- `npm test` - Run Jest tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run init-db` - Initialize the PostgreSQL database schema

## Database Setup

This application requires PostgreSQL. For new setups:

1. Create database: `createdb dispomed`
2. Create `.env` file with: `DATABASE_URL=postgres://localhost:5432/dispomed`
3. Initialize schema: `npm run init-db`

The application will display helpful error messages if the database is not set up correctly.

## Architecture Overview

### Backend (Express.js + PostgreSQL)
- **app.js**: Main Express server with API routes and page rendering
- **database/connect_db.js**: Database connection utilities and SQL file loading
- **database/init_db.js**: Database schema initialization
- **sql/**: SQL queries organized by domain (incidents, products, atc_classes, ema, substitutions)

### Frontend (Vanilla JS + D3.js)
- **public/js/**: Client-side modules using ES6 imports
  - `00_fetch_data.js`: API data fetching
  - `01_store_data.js`: Client-side data management
  - `draw.js`: Main D3.js visualization logic
  - `draw_product_page.js`: Product detail page visualization
  - `utils.js`: Shared utility functions
- **views/**: Pug templates for server-side rendering
- **public/stylesheets/**: Organized CSS structure
  - `common.css`: Shared styles (reset, variables, layout, filters, tooltips, responsive design)
  - `product.css`: Product page specific styles (CIS components, EMA incidents, timeline, donut charts)
  - `styles.css`: Legacy file (kept for reference, not used in templates)

### Key Data Flow
1. Server fetches pharmaceutical incident data from PostgreSQL
2. Data includes ATC classifications, CIS codes, EMA incidents, and therapeutic substitutions
3. D3.js creates time-based visualizations showing product availability status
4. Color coding: Red (supply rupture), Yellow (supply tension)

### Testing
- Jest with jsdom environment for frontend testing
- Tests located in `__tests__/` directory
- Coverage collection from `public/js/**/*.js`

### Domain Context
This is a pharmaceutical product availability dashboard that tracks medication supply chains and incidents. The application handles sensitive health data and provides transparency about drug shortages in France.