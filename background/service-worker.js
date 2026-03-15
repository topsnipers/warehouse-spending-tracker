chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SCRAPE_PROGRESS' || msg.type === 'DETAIL_PROGRESS') {
    // Store scraping state so popup can recover
    chrome.storage.session.set({ scrapeState: msg }).catch(() => {});
    chrome.runtime.sendMessage(msg).catch(() => {});
  }

  if (msg.type === 'SCRAPE_COMPLETE') {
    chrome.storage.local.set({
      costcoData: msg.data,
      lastScrapeTime: new Date().toISOString()
    }, () => {
      if (chrome.runtime.lastError) {
        chrome.runtime.sendMessage({
          type: 'SCRAPE_ERROR',
          error: `Failed to save results: ${chrome.runtime.lastError.message}`
        }).catch(() => {});
        return;
      }
      // Clear scraping state
      chrome.storage.session.remove('scrapeState').catch(() => {});
      chrome.runtime.sendMessage(msg).catch(() => {});
    });
  }

  if (msg.type === 'SCRAPE_ERROR') {
    chrome.storage.session.remove('scrapeState').catch(() => {});
    chrome.runtime.sendMessage(msg).catch(() => {});
  }

  if (msg.type === 'OPEN_RESULTS') {
    chrome.tabs.create({ url: chrome.runtime.getURL('results/results.html') });
  }

  return true;
});
