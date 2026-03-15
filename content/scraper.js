(() => {
  'use strict';

  let scraping = false;

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // --- DOM helpers ---

  function findPeriodSelect() {
    const selects = document.querySelectorAll('select');
    for (const s of selects) {
      const opts = [...s.options].map(o => o.text);
      if (opts.some(t => /\d{4}\s+(January|April|July|October)/.test(t))) return s;
    }
    return null;
  }

  function setSelectValue(el, value) {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype, 'value'
    ).set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function getPagination() {
    const m = document.body.innerText.match(COSTCO.PAGINATION_REGEX);
    return m ? { from: +m[1], to: +m[2], total: +m[3] } : null;
  }

  function parseReceipts() {
    const text = document.body.innerText;
    const re = new RegExp(COSTCO.RECEIPT_REGEX.source, 'g');
    const results = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      const total = parseFloat(m[4].replace(/,/g, ''));
      if (isNaN(total)) continue;
      results.push({
        date: m[1],
        time: m[2],
        store: m[3].trim(),
        total
      });
    }
    return results;
  }

  function getSnapshot() {
    return document.body.innerText.substring(0, 2000);
  }

  async function waitForUpdate(prevText, timeout) {
    timeout = timeout || COSTCO.WAIT_MAX_MS;
    await sleep(1000);
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const cur = document.body.innerText.substring(0, 2000);
      if (cur !== prevText) {
        await sleep(500);
        return true;
      }
      await sleep(COSTCO.WAIT_POLL_MS);
    }
    return false;
  }

  // --- Pagination ---

  function findPageButton(pageNum) {
    const btn = [...document.querySelectorAll('button')]
      .find(b => b.textContent.trim() === String(pageNum));
    if (btn) return btn;
    const nextBtn = document.querySelector(
      'button[aria-label*="next" i], button[aria-label*="forward" i]'
    );
    return nextBtn || null;
  }

  // --- Modal parsing (detailed scan) ---

  function parseModalText(text) {
    const result = {
      storeWithNum: '',
      storeNum: '',
      items: [],
      subtotal: 0,
      tax: 0,
      total: 0,
      itemsSold: 0,
      payment: ''
    };

    // Store with number: "NORTH TULSA #1640"
    const storeMatch = text.match(COSTCO.MODAL_STORE_NUM_REGEX);
    if (storeMatch) {
      result.storeWithNum = storeMatch[0].trim();
      result.storeNum = storeMatch[2];
    }

    // Items: tab-delimited lines
    const itemRe = new RegExp(COSTCO.MODAL_ITEM_REGEX.source, 'gm');
    let im;
    while ((im = itemRe.exec(text)) !== null) {
      result.items.push({
        itemNum: im[1],
        desc: im[2].trim(),
        amount: parseFloat(im[3].replace(/,/g, '')),
        taxFlag: im[4] || ''
      });
    }

    // Subtotal, Tax, Total
    const subM = text.match(COSTCO.MODAL_SUBTOTAL_REGEX);
    if (subM) result.subtotal = parseFloat(subM[1].replace(/,/g, ''));
    const taxM = text.match(COSTCO.MODAL_TAX_REGEX);
    if (taxM) result.tax = parseFloat(taxM[1].replace(/,/g, ''));
    const totM = text.match(COSTCO.MODAL_TOTAL_REGEX);
    if (totM) result.total = parseFloat(totM[1].replace(/,/g, ''));

    // Items Sold
    const isM = text.match(COSTCO.MODAL_ITEMS_SOLD_REGEX);
    if (isM) result.itemsSold = parseInt(isM[1]);

    // Payment: last 4 digits + card type
    const last4M = text.match(COSTCO.MODAL_PAYMENT_LAST4_REGEX);
    const cardM = text.match(COSTCO.MODAL_CARD_TYPE_REGEX);
    if (cardM && last4M) {
      result.payment = cardM[1] + ' ' + last4M[1];
    } else if (last4M) {
      result.payment = 'CARD ' + last4M[1];
    }

    // Derive qty/unitPrice for single-product receipts
    const realItems = result.items.filter(
      it => !/^DEPOSIT|^SURCHARGE|^SHOP CARD/.test(it.desc)
    );
    if (realItems.length === 1 && result.itemsSold > 0) {
      realItems[0].qty = result.itemsSold;
      realItems[0].unitPrice = Math.round((realItems[0].amount / result.itemsSold) * 100) / 100;
    }
    // Deposits: qty = amount / 25
    result.items.forEach(it => {
      if (/^DEPOSIT/.test(it.desc) && it.amount > 0) {
        it.qty = Math.round(it.amount / 25);
        it.unitPrice = 25;
      }
    });

    return result;
  }

  async function waitForModal(appear, timeout) {
    timeout = timeout || COSTCO.MODAL_WAIT_MS;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const modal = document.querySelector(COSTCO.MODAL_SELECTOR);
      if (appear && modal) return modal;
      if (!appear && !modal) return true;
      await sleep(300);
    }
    return null;
  }

  async function clickAndParseModal(btnIndex) {
    const btns = [...document.querySelectorAll('button')]
      .filter(b => b.textContent.includes('View Receipt'));
    if (btnIndex >= btns.length) return null;

    btns[btnIndex].click();
    const modal = await waitForModal(true);
    if (!modal) {
      console.warn(`[CostcoScraper] Modal did not appear for receipt ${btnIndex}`);
      return null;
    }

    await sleep(500);
    const text = modal.innerText;
    const parsed = parseModalText(text);

    // Close modal
    const allBtns = [...modal.querySelectorAll('button')];
    const close = allBtns.find(b => b.textContent.trim() === 'Close') || allBtns[allBtns.length - 1];
    if (close) close.click();
    await waitForModal(false, COSTCO.MODAL_CLOSE_WAIT_MS);
    await sleep(300);

    return parsed;
  }

  async function enrichPageReceipts(records, globalIdx, globalTotal) {
    const btns = [...document.querySelectorAll('button')]
      .filter(b => b.textContent.includes('View Receipt'));
    const count = Math.min(btns.length, records.length);

    for (let i = 0; i < count; i++) {
      chrome.runtime.sendMessage({
        type: COSTCO.MSG.DETAIL_PROGRESS,
        receiptIndex: globalIdx + i + 1,
        totalRecords: globalTotal,
        store: records[i].store,
        message: `Parsing receipt ${globalIdx + i + 1}/${globalTotal}: ${records[i].store}`
      }).catch(() => {});

      const modalData = await clickAndParseModal(i);
      if (modalData) {
        records[i].items = modalData.items;
        records[i].payment = modalData.payment;
        records[i].storeWithNum = modalData.storeWithNum;
        records[i].subtotal = modalData.subtotal;
        records[i].tax = modalData.tax;
        records[i].itemsSold = modalData.itemsSold;
      }

      if (isSessionExpired()) {
        throw new Error(
          `Session expired during detailed scan at receipt ${globalIdx + i + 1}. Please sign in again and retry.`
        );
      }
    }
  }

  // --- Scrape pages (supports quick and detailed modes) ---

  async function scrapeCurrentPeriodAllPages(detailed, globalIdx, globalTotal) {
    const records = [];
    const pageRecords = parseReceipts();
    records.push(...pageRecords);

    if (detailed && pageRecords.length > 0) {
      await enrichPageReceipts(pageRecords, globalIdx, globalTotal);
    }

    const pag = getPagination();
    if (!pag) return records;

    const totalPages = Math.ceil(pag.total / COSTCO.PAGE_SIZE);
    for (let p = 2; p <= totalPages; p++) {
      const snap = getSnapshot();
      const btn = findPageButton(p);
      if (!btn) {
        console.warn(`[CostcoScraper] Page ${p} button not found, stopping pagination.`);
        break;
      }
      btn.click();
      const updated = await waitForUpdate(snap, COSTCO.WAIT_MAX_MS);
      if (!updated) {
        console.warn(`[CostcoScraper] Timed out waiting for page ${p}, continuing with partial data.`);
      }
      const pr = parseReceipts();
      records.push(...pr);

      if (detailed && pr.length > 0) {
        await enrichPageReceipts(pr, globalIdx + records.length - pr.length, globalTotal);
      }
    }

    const expected = pag.total;
    if (records.length < expected * 0.8) {
      console.warn(`[CostcoScraper] Parsed ${records.length} receipts but page shows ${expected}. Some may be missed.`);
    }

    return records;
  }

  // --- Period ordering ---

  function getOrderedPeriods(selectEl) {
    const options = [...selectEl.options].map(o => o.value);
    const quarterly = options
      .filter(v => /^\d{4}/.test(v))
      .sort((a, b) => {
        const ya = parseInt(a), yb = parseInt(b);
        if (ya !== yb) return ya - yb;
        const qa = a.includes('January') ? 1 : a.includes('April') ? 2
          : a.includes('July') ? 3 : 4;
        const qb = b.includes('January') ? 1 : b.includes('April') ? 2
          : b.includes('July') ? 3 : 4;
        return qa - qb;
      });
    if (options.includes('Last 3 Months')) quarterly.push('Last 3 Months');
    return quarterly;
  }

  // --- Dedup ---

  function deduplicate(records) {
    const seen = new Set();
    return records.filter(r => {
      const key = `${r.date}|${r.time}|${r.store}|${r.total}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // --- Progress ---

  function sendProgress(msg) {
    chrome.runtime.sendMessage({
      type: COSTCO.MSG.SCRAPE_PROGRESS,
      ...msg
    }).catch(() => {});
  }

  // --- Session check ---

  function isSessionExpired() {
    const url = window.location.href;
    if (url.includes('signin.costco.com')) return true;
    const text = document.body.innerText.substring(0, 500);
    if (text.includes('Sign In') && !text.includes('Sign Out')) return true;
    return false;
  }

  // --- Date parsing ---

  function parseUsDate(dateStr) {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return new Date(0);
    const [mm, dd, yyyy] = parts.map(Number);
    return new Date(yyyy, mm - 1, dd);
  }

  // --- Main scrape flow ---

  async function runScrape(detailed) {
    if (scraping) return;
    scraping = true;

    try {
      const sel = findPeriodSelect();
      if (!sel) {
        throw new Error(
          'Cannot find time period dropdown. Make sure you are on the Warehouse tab of Orders & Purchases.'
        );
      }

      const periods = getOrderedPeriods(sel);
      if (periods.length === 0) {
        throw new Error('No time periods found in dropdown.');
      }

      let allRecords = [];
      let estimatedTotal = 0;

      for (let i = 0; i < periods.length; i++) {
        const period = periods[i];

        if (isSessionExpired()) {
          throw new Error(
            `Session expired while scraping. Got ${allRecords.length} receipts before losing connection. Please sign in again and retry.`
          );
        }

        sendProgress({
          period,
          periodIndex: i + 1,
          totalPeriods: periods.length,
          totalRecords: allRecords.length
        });

        const snap = getSnapshot();
        setSelectValue(sel, period);
        const periodSwitched = await waitForUpdate(snap, COSTCO.WAIT_MAX_MS);
        if (!periodSwitched) {
          console.warn(`[CostcoScraper] Timed out switching to "${period}", skipping.`);
          continue;
        }

        if (isSessionExpired()) {
          throw new Error(
            `Session expired during period switch. Got ${allRecords.length} receipts. Please sign in again and retry.`
          );
        }

        // Reset to page 1
        const p1 = [...document.querySelectorAll('button')]
          .find(b => b.textContent.trim() === '1');
        if (p1) {
          const snap2 = getSnapshot();
          p1.click();
          await waitForUpdate(snap2, COSTCO.WAIT_MAX_MS);
        }

        // Update estimated total for detailed progress
        if (detailed) {
          const pag = getPagination();
          estimatedTotal += pag ? pag.total : parseReceipts().length;
        }

        const periodRecords = await scrapeCurrentPeriodAllPages(
          detailed, allRecords.length, estimatedTotal || 999
        );
        allRecords.push(...periodRecords);

        sendProgress({
          period,
          periodIndex: i + 1,
          totalPeriods: periods.length,
          periodRecords: periodRecords.length,
          totalRecords: allRecords.length
        });
      }

      const unique = deduplicate(allRecords);
      const stats = computeStats(unique);

      chrome.runtime.sendMessage({
        type: COSTCO.MSG.SCRAPE_COMPLETE,
        data: { records: unique, stats, detailed: !!detailed }
      }).catch(() => {});
    } catch (err) {
      chrome.runtime.sendMessage({
        type: COSTCO.MSG.SCRAPE_ERROR,
        error: err.message
      }).catch(() => {});
    } finally {
      scraping = false;
    }
  }

  // --- Statistics ---

  function computeStats(records) {
    const sorted = [...records].sort((a, b) => parseUsDate(a.date) - parseUsDate(b.date));

    const dateRange = sorted.length > 0
      ? { from: sorted[0].date, to: sorted[sorted.length - 1].date }
      : { from: '', to: '' };

    const storeCounts = {};
    const storeSpend = {};
    records.forEach(r => {
      storeCounts[r.store] = (storeCounts[r.store] || 0) + 1;
      storeSpend[r.store] = (storeSpend[r.store] || 0) + r.total;
    });
    const storeRanking = Object.keys(storeCounts)
      .map(s => ({
        store: s,
        visits: storeCounts[s],
        totalSpend: Math.round(storeSpend[s] * 100) / 100
      }))
      .sort((a, b) => b.visits - a.visits || b.totalSpend - a.totalSpend)
      .map((s, i) => ({ rank: i + 1, ...s }));

    const yearly = {};
    records.forEach(r => {
      const y = r.date.split('/')[2];
      if (!y) return;
      if (!yearly[y]) yearly[y] = { receipts: 0, spend: 0, stores: new Set() };
      yearly[y].receipts++;
      yearly[y].spend += r.total;
      yearly[y].stores.add(r.store);
    });
    const yearlySummary = Object.entries(yearly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, v]) => ({
        year,
        receipts: v.receipts,
        spend: Math.round(v.spend * 100) / 100,
        uniqueStores: v.stores.size
      }));

    const quarterly = {};
    records.forEach(r => {
      const [mm, , yyyy] = r.date.split('/');
      if (!mm || !yyyy) return;
      const q = Math.ceil(parseInt(mm) / 3);
      const key = `${yyyy} Q${q}`;
      if (!quarterly[key]) quarterly[key] = { receipts: 0, spend: 0, stores: new Set() };
      quarterly[key].receipts++;
      quarterly[key].spend += r.total;
      quarterly[key].stores.add(r.store);
    });
    const quarterlySummary = Object.entries(quarterly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([quarter, v]) => ({
        quarter,
        receipts: v.receipts,
        spend: Math.round(v.spend * 100) / 100,
        uniqueStores: v.stores.size
      }));

    let totalItems = 0;
    records.forEach(r => {
      if (r.items) totalItems += r.items.length;
    });

    return {
      summary: {
        totalReceipts: records.length,
        uniqueStores: storeRanking.length,
        totalSpend: Math.round(records.reduce((s, r) => s + r.total, 0) * 100) / 100,
        totalItems,
        dateRange
      },
      storeRanking,
      yearly: yearlySummary,
      quarterly: quarterlySummary
    };
  }

  // --- Message listener ---

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === COSTCO.MSG.START_SCRAPE) {
      runScrape(false);
      sendResponse({ started: true });
    }
    if (msg.type === COSTCO.MSG.START_DETAILED_SCRAPE) {
      runScrape(true);
      sendResponse({ started: true });
    }
    return true;
  });
})();
