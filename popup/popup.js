const btnStart = document.getElementById('btnStart');
const btnResults = document.getElementById('btnResults');
const statusEl = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const lastScrapeEl = document.getElementById('lastScrape');
const proStatusEl = document.getElementById('proStatus');

let isProUser = false;

function getScanMode() {
  const checked = document.querySelector('input[name="scanMode"]:checked');
  return checked ? checked.value : 'quick';
}

// Check pro status
CostcoPro.isPro().then(pro => {
  isProUser = pro;
  if (pro && proStatusEl) proStatusEl.style.display = '';
});

// Check for existing data + in-progress scrape
chrome.storage.local.get(['costcoData', 'lastScrapeTime'], (data) => {
  if (data.costcoData && data.costcoData.stats && data.costcoData.stats.summary) {
    btnResults.style.display = 'block';
    const s = data.costcoData.stats.summary;
    const detail = data.costcoData.detailed ? ' (detailed)' : '';
    statusEl.textContent = `Last scan${detail}: ${s.totalReceipts} receipts, ${s.uniqueStores} stores, $${s.totalSpend.toLocaleString()}`;
  }
  if (data.lastScrapeTime) {
    const d = new Date(data.lastScrapeTime);
    lastScrapeEl.textContent = `Last scraped: ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  }
});

// Recover in-progress state if popup was reopened
chrome.storage.session.get('scrapeState', (data) => {
  if (data.scrapeState) {
    const msg = data.scrapeState;
    btnStart.disabled = true;
    btnStart.textContent = 'Scraping...';
    progressBar.style.display = 'block';
    if (msg.periodIndex && msg.totalPeriods) {
      const pct = Math.round((msg.periodIndex / msg.totalPeriods) * 100);
      progressFill.style.width = pct + '%';
      statusEl.textContent = `Scraping ${msg.period} (${msg.periodIndex}/${msg.totalPeriods})...\n${msg.totalRecords || 0} receipts found`;
    } else if (msg.message) {
      statusEl.textContent = msg.message;
    }
  }
});

btnStart.addEventListener('click', async () => {
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (err) {
    statusEl.style.color = '#e31837';
    statusEl.textContent = `Failed to query tab: ${err.message}`;
    return;
  }

  if (!tab || !tab.url || !tab.url.includes('costco.com/myaccount')) {
    statusEl.textContent = 'Please navigate to Costco Orders & Purchases page first, then click the Warehouse tab.';
    statusEl.style.color = '#e31837';
    return;
  }

  const mode = getScanMode();

  // Gate detailed scan behind Pro
  if (mode === 'detailed' && !isProUser) {
    statusEl.style.color = '#e31837';
    statusEl.textContent = 'Detailed Scan requires Pro. Open Results page to upgrade.';
    return;
  }

  const msgType = mode === 'detailed' ? 'START_DETAILED_SCRAPE' : 'START_SCRAPE';

  btnStart.disabled = true;
  btnStart.textContent = mode === 'detailed' ? 'Detailed Scan...' : 'Scraping...';
  progressBar.style.display = 'block';
  statusEl.style.color = '#666';
  statusEl.textContent = mode === 'detailed'
    ? 'Starting detailed scan (this takes longer)...'
    : 'Starting...';

  chrome.tabs.sendMessage(tab.id, { type: msgType }, (response) => {
    if (chrome.runtime.lastError || !response || !response.started) {
      btnStart.disabled = false;
      btnStart.textContent = 'Start Scraping';
      progressBar.style.display = 'none';
      statusEl.style.color = '#e31837';
      statusEl.textContent = chrome.runtime.lastError
        ? chrome.runtime.lastError.message
        : 'Content script not ready. Refresh the Costco page and try again.';
    }
  });
});

btnResults.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'OPEN_RESULTS' });
});

// Listen for progress & completion
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SCRAPE_PROGRESS') {
    const pct = Math.round((msg.periodIndex / msg.totalPeriods) * 100);
    progressFill.style.width = pct + '%';
    statusEl.textContent = `Scraping ${msg.period} (${msg.periodIndex}/${msg.totalPeriods})...\n${msg.totalRecords} receipts found`;
  }

  if (msg.type === 'DETAIL_PROGRESS') {
    statusEl.textContent = msg.message || `Parsing receipt ${msg.receiptIndex}/${msg.totalRecords}...`;
  }

  if (msg.type === 'SCRAPE_COMPLETE') {
    const s = msg.data.stats.summary;
    btnStart.disabled = false;
    btnStart.textContent = 'Start Scraping';
    btnResults.style.display = 'block';
    progressFill.style.width = '100%';
    statusEl.style.color = '#2e7d32';
    const itemInfo = s.totalItems > 0 ? `, ${s.totalItems} items` : '';
    statusEl.textContent = `Done! ${s.totalReceipts} receipts${itemInfo}, ${s.uniqueStores} stores, $${s.totalSpend.toLocaleString()}`;
    lastScrapeEl.textContent = `Last scraped: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
  }

  if (msg.type === 'SCRAPE_ERROR') {
    btnStart.disabled = false;
    btnStart.textContent = 'Start Scraping';
    progressBar.style.display = 'none';
    statusEl.style.color = '#e31837';
    statusEl.textContent = 'Error: ' + msg.error;
  }
});
