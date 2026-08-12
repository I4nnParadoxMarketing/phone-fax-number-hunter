# Phone & Fax Number Hunter

Search any website for phone numbers, fax numbers, or custom text — across the entire site, not just a single page.

Enter a URL, choose what to look for, and get back every match with the page it was found on.

**Live app:** [https://phone-fax-number-hunter.vercel.app/](https://phone-fax-number-hunter.vercel.app/)

---

## Overview

**Phone & Fax Number Hunter** is a web app that crawls a target website and finds contact information and other text you specify. Instead of manually opening dozens of pages, you point the tool at a domain and let it scan the full site.

### What you can search for

| Search type | Examples |
|-------------|----------|
| **Phone numbers** | `(555) 123-4567`, `+1-555-123-4567`, `555.123.4567` |
| **Fax numbers** | Same formats as phone; often labeled "Fax", "Facsimile", or "F:" |
| **Custom text** | Company names, department labels, product codes, or any string |

---

## Features

- **Full-site crawl** — Follows internal links within the same domain to search every reachable page
- **Flexible input** — Enter a website URL plus a phone number, fax number, or free-text query
- **Smart matching** — Normalizes phone/fax formats so `(555) 123-4567` matches `5551234567`
- **Results with context** — Shows the page URL, matched value, and surrounding snippet
- **Export** — Download results as CSV or copy to clipboard *(planned)*

---

## How it works

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│  User enters│     │  Crawler     │     │  Extractor  │     │  Results     │
│  URL + query│ ──► │  visits pages│ ──► │  finds      │ ──► │  page + match│
│             │     │  on same site│     │  matches    │     │  + snippet   │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────────┘
```

1. **Input** — User provides a starting URL (e.g. `https://example.com`) and a search term or number pattern.
2. **Crawl** — The app fetches pages starting from that URL, discovers internal links, and queues them for scanning (respecting depth and page limits).
3. **Extract & match** — Each page is parsed for phone numbers, fax numbers, and/or the custom text query.
4. **Report** — Matches are listed with source URL, matched value, and optional context.

---

## Usage

### Web UI

1. Open the [live app](https://phone-fax-number-hunter.vercel.app/) or run it locally.
2. Enter the **Website URL** to scan (e.g. `https://company.com`).
3. Choose search mode:
   - **Phone number** — find all phone numbers on the site
   - **Fax number** — find fax lines (by label or pattern)
   - **Custom text** — search for any string
4. Optionally enter a **specific number or text** to filter results.
5. Click **Search** and review matches.

### Example

| Field | Value |
|-------|-------|
| Website URL | `https://hospital.example.org` |
| Search type | Phone number |
| Query | `800-555-0199` |

**Result:**

| Page | Match | Context |
|------|-------|---------|
| `/contact` | `800-555-0199` | "Billing inquiries: 800-555-0199" |
| `/departments/billing` | `(800) 555-0199` | "Call us at (800) 555-0199" |

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 (App Router), React, Tailwind CSS |
| Backend | Next.js API routes |
| Crawling | `fetch` + Cheerio (HTML parsing and link discovery) |
| Parsing | Regex + `libphonenumber-js` for phone/fax normalization |

---

## Project structure

```
phone-fax-number-hunter/
├── README.md
├── src/
│   ├── app/
│   │   ├── api/search/route.ts   # POST /api/search
│   │   ├── page.tsx              # Search UI
│   │   └── layout.tsx
│   └── lib/
│       ├── crawler.ts            # Site crawling
│       ├── extractor.ts          # Phone, fax, and text matching
│       ├── normalize.ts          # Number format normalization
│       └── types.ts
└── package.json
```

---

## Getting started

```bash
# Clone the repository
git clone https://github.com/I4nnParadoxMarketing/phone-fax-number-hunter.git
cd phone-fax-number-hunter

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### API

`POST /api/search`

```json
{
  "url": "https://example.com",
  "searchType": "phone",
  "query": "800-555-0199",
  "maxPages": 50
}
```

`searchType` must be `"phone"`, `"fax"`, or `"text"`. For `"text"`, `query` is required.

---

## Configuration *(planned)*

| Setting | Description | Default |
|---------|-------------|---------|
| `MAX_PAGES` | Maximum pages to crawl per search | `100` |
| `CRAWL_DELAY_MS` | Delay between requests (politeness) | `500` |
| `REQUEST_TIMEOUT_MS` | Per-page fetch timeout | `10000` |

---

## Limitations & ethics

- **Same-origin only** — Only pages on the submitted domain are crawled (no external sites).
- **Robots.txt** — The crawler should respect `robots.txt` and rate limits.
- **JavaScript sites** — Static HTML parsing may miss content loaded entirely via JS; Playwright can be used for those cases.
- **Legal use** — Use only on sites you are allowed to scan. Do not use for spam, harassment, or scraping protected data without permission.

---

## Roadmap

- [x] Web UI with URL + search form
- [x] Site crawler with configurable page limit
- [x] Phone and fax number detection and normalization
- [x] Custom text search
- [x] Results table with CSV export
- [x] Live crawl progress indicator (streaming)
- [ ] Respect `robots.txt`
- [ ] Optional JavaScript rendering (Playwright)

---

## License

TBD

---

## Contributing

Contributions welcome once the initial codebase is in place. Open an issue or pull request to discuss changes.

---

## Credits

Built by **Paradox Marketing**.
