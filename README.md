# Warehouse Spending Tracker

A Chrome extension that analyzes your Costco warehouse purchase history — store visits, spending trends, and more.

## Features

- Automatically scrapes all warehouse purchase records from your Costco account
- Supports all available time periods (quarterly, going back to the earliest available)
- Generates comprehensive statistics:
  - **Store Ranking** — every store you've visited, ranked by visit count, with total and average spend
  - **Yearly Summary** — receipts, spend, and unique stores per year
  - **Quarterly Summary** — same breakdown by quarter
  - **All Receipts** — sortable raw data table
- Export data as **CSV** or **JSON**
- Clean, modern results page with sortable tables

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked** and select the `chrome-ext` folder
5. The Warehouse Spending Tracker icon will appear in your toolbar

## Usage

1. Go to [costco.com](https://www.costco.com) and **sign in** to your account
2. Navigate to **Orders & Purchases** → click the **Warehouse** tab
3. Click the extension icon and press **Start Scraping**
4. Wait while the extension automatically:
   - Cycles through all available time periods
   - Paginates through all pages of each period
   - Parses and deduplicates all receipts
5. When complete, click **View Results** to see your analysis

## How It Works

The extension reads the Orders & Purchases page that Costco already provides to all members. It:

1. Finds the time period dropdown (`<select>`) on the Warehouse tab
2. Iterates through each quarterly period (oldest to newest)
3. For each period, clicks through all pagination pages
4. Extracts date, time, warehouse name, and total from each visible receipt entry
5. Deduplicates records (the "Last 3 Months" option overlaps with quarterly periods)
6. Computes statistics and stores results locally in your browser

**No data is sent anywhere.** All processing happens locally in your browser. The extension only accesses `costco.com` — the same page you're already looking at.

## Privacy

- No external servers — all data stays in your browser's local storage
- No tracking or analytics
- No data collection whatsoever
- You can clear all stored data from the extension popup

## Permissions

- `activeTab` — to interact with the Costco page when you click the extension
- `storage` — to save scraped data locally in your browser
- `host_permissions: costco.com` — to run the content script on the Costco orders page

## Export Format

### CSV
```
date,time,store,total
01/07/2024,10:32am,"TUSTIN",87.45
```

### JSON
```json
{
  "summary": {
    "totalReceipts": 452,
    "uniqueStores": 190,
    "totalSpend": 716367.80,
    "dateRange": { "from": "01/07/2024", "to": "03/13/2026" }
  },
  "yearly": [...],
  "quarterly": [...],
  "storeRanking": [...],
  "records": [...]
}
```

## Requirements

- Google Chrome (or any Chromium-based browser)
- A Costco membership account with warehouse purchase history

## License

MIT
