const COSTCO = {
  // Matches: In-Warehouse\n{date} - {time}\n{STORE}\nTotal\n${amount}
  // Uses [\s\S] for cross-platform newline compatibility (\n or \r\n)
  RECEIPT_REGEX: /In-Warehouse[\s\S](\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}:\d{2}[ap]m)[\s\S]([A-Z][A-Z\s.\-]+?)[\s\S]Total[\s\S]\$?([\d,.\-]+\.\d{2})/g,

  PAGINATION_REGEX: /Showing (\d+)\s*-\s*(\d+) of (\d+)/,

  WAIT_POLL_MS: 500,
  WAIT_MAX_MS: 15000,
  PAGE_SIZE: 10,

  // Detailed scan timing
  MODAL_WAIT_MS: 4000,
  MODAL_CLOSE_WAIT_MS: 800,
  MODAL_SELECTOR: '.MuiDialog-root',

  // Modal text parsing regex
  MODAL_ITEM_REGEX: /^\t(\d{5,7})\t(.+?)\t([\d,]+\.\d{2})\s*([A-Z]?)$/gm,
  MODAL_STORE_NUM_REGEX: /^(.+?)\s*#(\d+)$/m,
  MODAL_PAYMENT_LAST4_REGEX: /X{8,}(\d{4})/,
  MODAL_CARD_TYPE_REGEX: /^(VISA|MC|MASTERCARD|AMEX|DISCOVER)\s/m,
  MODAL_SUBTOTAL_REGEX: /\tSUBTOTAL\t([\d,]+\.\d{2})/,
  MODAL_TAX_REGEX: /\tTAX\t([\d,]+\.\d{2})/,
  MODAL_TOTAL_REGEX: /\*{4}\s*TOTAL\t([\d,]+\.\d{2})/,
  MODAL_ITEMS_SOLD_REGEX: /ITEMS SOLD\s*=\s*(\d+)/,

  DETAILED_CSV_HEADER: 'Date,Time,Warehouse,Store,Item#,Description,Qty,Unit Price,Amount,TaxFlag,Subtotal,Tax,Total,ItemsSold,Payment',

  MSG: {
    START_SCRAPE: 'START_SCRAPE',
    START_DETAILED_SCRAPE: 'START_DETAILED_SCRAPE',
    SCRAPE_PROGRESS: 'SCRAPE_PROGRESS',
    DETAIL_PROGRESS: 'DETAIL_PROGRESS',
    SCRAPE_COMPLETE: 'SCRAPE_COMPLETE',
    SCRAPE_ERROR: 'SCRAPE_ERROR',
    OPEN_RESULTS: 'OPEN_RESULTS'
  }
};

if (typeof module !== 'undefined') module.exports = COSTCO;
