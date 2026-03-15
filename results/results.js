(() => {
  'use strict';

  let allRecords = [];
  let allStats = {};
  let hasDetailedData = false;
  let isProUser = false;

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  // --- Security: HTML escape to prevent XSS ---
  function esc(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
  }

  // --- CSV safety: prevent formula injection ---
  function csvCell(value) {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  // --- Date parsing (safe, no Date constructor on MM/DD/YYYY) ---
  function parseUsDate(dateStr) {
    const parts = String(dateStr).split('/');
    if (parts.length !== 3) return new Date(0);
    const [mm, dd, yyyy] = parts.map(Number);
    return new Date(yyyy, mm - 1, dd);
  }

  function fmtMoney(n) {
    return '$' + Number(n || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // --- Member since: earliest receipt year ---
  function getMemberSinceYear() {
    if (!allRecords || allRecords.length === 0) return null;
    let earliest = Infinity;
    allRecords.forEach(r => {
      const d = parseUsDate(r.date);
      if (d.getTime() > 0 && d.getFullYear() < earliest) earliest = d.getFullYear();
    });
    return earliest === Infinity ? null : earliest;
  }

  // --- Data validation ---
  function isValidPayload(data) {
    return Boolean(
      data &&
      Array.isArray(data.records) &&
      data.stats &&
      data.stats.summary &&
      typeof data.stats.summary.totalReceipts === 'number' &&
      Array.isArray(data.stats.storeRanking) &&
      Array.isArray(data.stats.yearly) &&
      Array.isArray(data.stats.quarterly)
    );
  }

  // --- Load data + check pro status ---
  chrome.storage.local.get(['costcoData', 'lastScrapeTime'], (data) => {
    if (!isValidPayload(data.costcoData)) {
      $('.container').innerHTML =
        '<div style="text-align:center;padding:60px;color:#888;">' +
        '<h2>No Valid Data Found</h2>' +
        '<p>Go to Costco Orders &amp; Purchases page and run the scraper first.</p></div>';
      return;
    }
    allRecords = data.costcoData.records;
    allStats = data.costcoData.stats;
    hasDetailedData = allRecords.some(r => r.items && r.items.length > 0);

    // Check pro status then render
    CostcoPro.isPro().then(pro => {
      isProUser = pro;
      applyProState();
      render();
    });
  });

  // --- Pro State Management ---
  function applyProState() {
    // Update badge
    const badge = $('#proBadge');
    if (badge) badge.style.display = isProUser ? 'inline-block' : 'none';

    // Update upgrade button
    const upgradeBtn = $('#btnUpgrade');
    if (upgradeBtn) upgradeBtn.style.display = isProUser ? 'none' : '';

    // Update export buttons
    $$('.pro-feature').forEach(btn => {
      if (isProUser) {
        btn.classList.remove('locked');
        btn.textContent = btn.textContent.replace(/^🔒\s*/, '');
      } else {
        btn.classList.add('locked');
        if (!btn.textContent.startsWith('🔒')) {
          btn.textContent = '🔒 ' + btn.textContent;
        }
      }
    });
  }

  function requirePro(action) {
    if (isProUser) return true;
    showUpgradeModal();
    return false;
  }

  function showUpgradeModal() {
    // Remove existing modal if any
    const existing = $('.pro-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'pro-overlay';
    overlay.innerHTML = `
      <div class="pro-modal">
        <h3>Unlock Pro Features</h3>
        <div class="pro-price">$9.99</div>
        <div class="pro-price-sub">One-time payment \xB7 Lifetime access</div>
        <ul>
          <li>Export to Excel (XLSX)</li>
          <li>Export to CSV &amp; JSON</li>
          <li>Detailed Scan (item-level data)</li>
          <li>Detailed CSV for accounting</li>
          <li>Future features included</li>
        </ul>
        <a class="btn-buy" href="https://sniperforce.gumroad.com/l/jxvwzg" target="_blank" rel="noopener">Get Pro License</a>
        <div class="divider">Already have a license key?</div>
        <div class="key-input-group">
          <input type="text" id="proKeyInput" placeholder="WST-PRO-XXXX-XXXX-XXXX" maxlength="22" spellcheck="false" autocomplete="off">
          <button id="proKeyActivate">Activate</button>
        </div>
        <div class="key-error" id="proKeyError"></div>
        <button class="btn-close-pro" id="proModalClose">Maybe later</button>
      </div>`;

    overlay.querySelector('#proKeyActivate').addEventListener('click', async () => {
      const input = overlay.querySelector('#proKeyInput');
      const errorEl = overlay.querySelector('#proKeyError');
      const key = input.value.trim();

      if (!key) {
        errorEl.textContent = 'Please enter your license key';
        return;
      }

      try {
        await CostcoPro.activate(key);
        isProUser = true;
        applyProState();
        // Show success state
        overlay.querySelector('.pro-modal').innerHTML =
          '<div class="key-success" style="padding:40px 0;">' +
          '<div style="font-size:48px;margin-bottom:16px;">🎉</div>' +
          '<h3 style="margin-bottom:8px;">Pro Activated!</h3>' +
          '<p style="color:#888;font-size:14px;">All features are now unlocked.</p>' +
          '<button class="btn-close-pro" style="margin-top:20px;padding:10px 24px;background:#e31837;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer;">Let\'s go!</button>' +
          '</div>';
        overlay.querySelector('.btn-close-pro').addEventListener('click', () => overlay.remove());
      } catch (e) {
        errorEl.textContent = 'Invalid license key. Please check and try again.';
        input.style.borderColor = '#e31837';
      }
    });

    // Enter key to activate
    overlay.querySelector('#proKeyInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') overlay.querySelector('#proKeyActivate').click();
    });

    overlay.querySelector('#proModalClose').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    document.body.appendChild(overlay);
    overlay.querySelector('#proKeyInput').focus();
  }

  // Upgrade button click
  $('#btnUpgrade').addEventListener('click', () => showUpgradeModal());

  function render() {
    const s = allStats.summary;

    // Header
    $('#headerSub').textContent =
      `${s.dateRange.from} — ${s.dateRange.to} | ${allRecords.length} receipts across ${s.uniqueStores} stores`;

    // Summary cards
    $('#totalReceipts').textContent = s.totalReceipts.toLocaleString();
    $('#totalSpend').textContent = fmtMoney(s.totalSpend);
    $('#uniqueStores').textContent = s.uniqueStores;
    const fromParts = (s.dateRange.from || '').split('/');
    const toParts = (s.dateRange.to || '').split('/');
    const rangeText = fromParts.length === 3 && toParts.length === 3
      ? `${fromParts[0]}/${fromParts[2]} — ${toParts[0]}/${toParts[2]}`
      : 'N/A';
    $('#dateRange').textContent = rangeText;
    $('#dateRange').style.fontSize = '18px';

    // Member since: earliest receipt year → membership year
    const memberYear = getMemberSinceYear();
    const now = new Date();
    const years = memberYear ? now.getFullYear() - memberYear : 0;
    if (memberYear) {
      $('#memberSince').textContent = String(memberYear);
      $('#memberSince').parentElement.querySelector('.label').textContent =
        years >= 2 ? `Member · ${years} Years` : years === 1 ? 'Member · 1 Year' : 'Member Since';
    }

    // Show detailed features if available
    if (hasDetailedData) {
      $('#exportDetailedCSV').style.display = '';
      $('#tabItems').style.display = '';
    }

    renderStoreTable();
    renderYearlyTable();
    renderQuarterlyTable();
    renderRawTable();
    if (hasDetailedData) renderItemsTable();
  }

  // --- Store Ranking ---
  function renderStoreTable() {
    const ranking = allStats.storeRanking || [];
    const maxVisits = Math.max(1, ...ranking.map(s => s.visits || 0));
    const tbody = $('#storeTable tbody');
    tbody.innerHTML = ranking.map(s => {
      const avg = s.visits > 0 ? s.totalSpend / s.visits : 0;
      const barW = Math.round(((s.visits || 0) / maxVisits) * 100);
      return `<tr>
        <td class="rank num">${esc(s.rank)}</td>
        <td class="store">${esc(s.store)}</td>
        <td class="num">${esc(s.visits)}</td>
        <td class="num">${fmtMoney(s.totalSpend)}</td>
        <td class="num">${fmtMoney(avg)}</td>
        <td><span class="visits-bar" style="width:${barW}px"></span></td>
      </tr>`;
    }).join('');
  }

  // --- Yearly ---
  function renderYearlyTable() {
    const tbody = $('#yearlyTable tbody');
    const yearly = allStats.yearly || [];
    const rows = yearly.map(y => {
      const avg = y.receipts > 0 ? y.spend / y.receipts : 0;
      return `<tr>
        <td><strong>${esc(y.year)}</strong></td>
        <td class="num">${esc(y.receipts)}</td>
        <td class="num">${fmtMoney(y.spend)}</td>
        <td class="num">${esc(y.uniqueStores)}</td>
        <td class="num">${fmtMoney(avg)}</td>
      </tr>`;
    });
    const totR = yearly.reduce((s, y) => s + (y.receipts || 0), 0);
    const totS = yearly.reduce((s, y) => s + (y.spend || 0), 0);
    const totStores = allStats.summary.uniqueStores || 0;
    rows.push(`<tr style="font-weight:700;border-top:2px solid #ddd;">
      <td>Total</td>
      <td class="num">${totR}</td>
      <td class="num">${fmtMoney(totS)}</td>
      <td class="num">${totStores}</td>
      <td class="num">${fmtMoney(totR > 0 ? totS / totR : 0)}</td>
    </tr>`);
    tbody.innerHTML = rows.join('');
  }

  // --- Quarterly ---
  function renderQuarterlyTable() {
    const tbody = $('#quarterlyTable tbody');
    tbody.innerHTML = (allStats.quarterly || []).map(q => {
      const avg = q.receipts > 0 ? q.spend / q.receipts : 0;
      return `<tr>
        <td><strong>${esc(q.quarter)}</strong></td>
        <td class="num">${esc(q.receipts)}</td>
        <td class="num">${fmtMoney(q.spend)}</td>
        <td class="num">${esc(q.uniqueStores)}</td>
        <td class="num">${fmtMoney(avg)}</td>
      </tr>`;
    }).join('');
  }

  // --- Raw Receipts ---
  function renderRawTable() {
    const sorted = [...allRecords].sort((a, b) => parseUsDate(b.date) - parseUsDate(a.date));
    const tbody = $('#rawTable tbody');
    tbody.innerHTML = sorted.map(r => {
      const payment = r.payment ? esc(r.payment) : '<span style="color:#ccc">-</span>';
      const itemCount = r.items ? r.items.length : '';
      return `<tr>
        <td>${esc(r.date)}</td>
        <td>${esc(r.time)}</td>
        <td class="store">${esc(r.store)}</td>
        <td class="num">${fmtMoney(r.total)}</td>
        <td>${payment}</td>
        <td class="num">${itemCount}</td>
      </tr>`;
    }).join('');
  }

  // --- Item Details ---
  function renderItemsTable() {
    const placeholder = $('#itemsPlaceholder');
    const table = $('#itemsTable');
    if (!hasDetailedData) return;

    placeholder.style.display = 'none';
    table.style.display = '';

    const sorted = [...allRecords]
      .filter(r => r.items && r.items.length > 0)
      .sort((a, b) => parseUsDate(b.date) - parseUsDate(a.date));

    const rows = [];
    sorted.forEach(r => {
      // Receipt header row
      rows.push(`<tr class="item-receipt-header">
        <td>${esc(r.date)}</td>
        <td class="store">${esc(r.storeWithNum || r.store)}</td>
        <td colspan="4" style="color:#888">${esc(r.time)} | ${r.items.length} items | ${esc(r.itemsSold || '')} sold</td>
        <td class="num" style="font-weight:600">${fmtMoney(r.total)}</td>
        <td>${esc(r.tax ? fmtMoney(r.tax) : '')}</td>
        <td>${esc(r.payment || '')}</td>
      </tr>`);
      // Item rows
      r.items.forEach(it => {
        const isDeposit = /^DEPOSIT|^SURCHARGE/.test(it.desc);
        const cls = isDeposit ? ' class="deposit-row"' : '';
        rows.push(`<tr${cls}>
          <td></td>
          <td></td>
          <td class="num" style="color:#666">${esc(it.itemNum)}</td>
          <td>${esc(it.desc)}</td>
          <td class="num">${it.qty != null ? esc(it.qty) : ''}</td>
          <td class="num">${it.unitPrice != null ? fmtMoney(it.unitPrice) : ''}</td>
          <td class="num">${fmtMoney(it.amount)}</td>
          <td style="color:#999">${esc(it.taxFlag)}</td>
          <td></td>
        </tr>`);
      });
    });

    table.querySelector('tbody').innerHTML = rows.join('');
  }

  // --- Tab switching ---
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      $$('.tab-content').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const target = $(`#tab-${tab.dataset.tab}`);
      if (target) target.classList.add('active');
    });
  });

  // --- Table sorting ---
  $$('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const table = th.closest('table');
      const tbody = table.querySelector('tbody');
      const isAsc = th.classList.contains('sort-asc');

      table.querySelectorAll('th').forEach(h => {
        h.classList.remove('sort-asc', 'sort-desc');
      });
      th.classList.add(isAsc ? 'sort-desc' : 'sort-asc');

      const colIdx = [...th.parentElement.children].indexOf(th);
      const rows = [...tbody.querySelectorAll('tr')];
      rows.sort((a, b) => {
        if (!a.children[colIdx] || !b.children[colIdx]) return 0;
        let aVal = a.children[colIdx].textContent.replace(/[$,]/g, '');
        let bVal = b.children[colIdx].textContent.replace(/[$,]/g, '');
        const aNum = parseFloat(aVal), bNum = parseFloat(bVal);
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return isAsc ? bNum - aNum : aNum - bNum;
        }
        return isAsc ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
      });
      rows.forEach(r => tbody.appendChild(r));
    });
  });

  // --- i18n for share card ---
  const SHARE_LANG = {
    en: {
      header: 'MY COSTCO',
      title: 'Spending Report',
      totalSpent: 'Total Spent at Costco',
      receipts: 'Receipts',
      storesVisited: 'Stores Visited',
      avgVisit: 'Avg / Visit',
      yearlyBreakdown: 'Yearly Breakdown',
      stores: 'stores',
      memberSince: 'Member Since',
      yearMember: '-Year Member',
      footer: 'Warehouse Spending Tracker',
      modalTitle: 'Share your Costco stats!',
      download: 'Download Image',
      copy: 'Copy to Clipboard',
      copied: 'Copied!',
      close: 'Close'
    },
    zh: {
      header: '\u6211\u7684 COSTCO',
      title: '\u6D88\u8D39\u62A5\u544A',
      totalSpent: 'Costco \u603B\u6D88\u8D39',
      receipts: '\u8BA2\u5355\u6570',
      storesVisited: '\u95E8\u5E97\u6570',
      avgVisit: '\u5747\u6D88\u8D39',
      yearlyBreakdown: '\u5E74\u5EA6\u6C47\u603B',
      stores: '\u5E97',
      memberSince: '\u4F1A\u5458\u81EA',
      yearMember: '\u5E74\u4F1A\u5458',
      footer: '\u4ED3\u50A8\u6D88\u8D39\u8FFD\u8E2A\u5668',
      modalTitle: '\u5206\u4EAB\u4F60\u7684 Costco \u6570\u636E\uFF01',
      download: '\u4E0B\u8F7D\u56FE\u7247',
      copy: '\u590D\u5236\u5230\u526A\u8D34\u677F',
      copied: '\u5DF2\u590D\u5236\uFF01',
      close: '\u5173\u95ED'
    },
    ja: {
      header: 'MY COSTCO',
      title: '\u652F\u51FA\u30EC\u30DD\u30FC\u30C8',
      totalSpent: 'Costco \u7DCF\u652F\u51FA\u984D',
      receipts: '\u30EC\u30B7\u30FC\u30C8',
      storesVisited: '\u8A2A\u554F\u5E97\u8217',
      avgVisit: '\u5E73\u5747/\u56DE',
      yearlyBreakdown: '\u5E74\u5225\u5185\u8A33',
      stores: '\u5E97\u8217',
      memberSince: '\u4F1A\u54E1\u6B74',
      yearMember: '\u5E74\u4F1A\u54E1',
      footer: 'Warehouse Spending Tracker',
      modalTitle: 'Costco\u306E\u7D71\u8A08\u3092\u30B7\u30A7\u30A2\uFF01',
      download: '\u753B\u50CF\u3092\u4FDD\u5B58',
      copy: '\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC',
      copied: '\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F\uFF01',
      close: '\u9589\u3058\u308B'
    },
    ko: {
      header: 'MY COSTCO',
      title: '\uC18C\uBE44 \uBCF4\uACE0\uC11C',
      totalSpent: 'Costco \uCD1D \uC18C\uBE44\uC561',
      receipts: '\uC601\uC218\uC99D',
      storesVisited: '\uBC29\uBB38 \uB9E4\uC7A5',
      avgVisit: '\uD3C9\uADE0/\uBC29\uBB38',
      yearlyBreakdown: '\uC5F0\uB3C4\uBCC4 \uC694\uC57D',
      stores: '\uB9E4\uC7A5',
      memberSince: '\uD68C\uC6D0 \uAC00\uC785',
      yearMember: '\uB144 \uD68C\uC6D0',
      footer: 'Warehouse Spending Tracker',
      modalTitle: 'Costco \uD1B5\uACC4\uB97C \uACF5\uC720\uD558\uC138\uC694!',
      download: '\uC774\uBBF8\uC9C0 \uB2E4\uC6B4\uB85C\uB4DC',
      copy: '\uD074\uB9BD\uBCF4\uB4DC\uC5D0 \uBCF5\uC0AC',
      copied: '\uBCF5\uC0AC\uB428!',
      close: '\uB2EB\uAE30'
    }
  };

  function getShareLang() {
    const lang = (navigator.language || 'en').toLowerCase();
    if (lang.startsWith('zh')) return SHARE_LANG.zh;
    if (lang.startsWith('ja')) return SHARE_LANG.ja;
    if (lang.startsWith('ko')) return SHARE_LANG.ko;
    return SHARE_LANG.en;
  }

  // --- Share Card (Canvas-based, no external library) ---
  $('#btnShare').addEventListener('click', () => generateShareCard());

  function generateShareCard() {
    const s = allStats.summary;
    const t = getShareLang();
    const W = 1200, H = 1600;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#1a1a2e');
    grad.addColorStop(0.5, '#16213e');
    grad.addColorStop(1, '#0f3460');
    ctx.fillStyle = grad;
    roundRect(ctx, 0, 0, W, H, 0);
    ctx.fill();

    // Decorative circles
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#e31837';
    ctx.beginPath(); ctx.arc(W - 100, 200, 300, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(100, H - 200, 200, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // Header label
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '600 32px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(t.header, 96, 140);

    // Title + year range
    const fromY = (s.dateRange.from || '').split('/')[2] || '';
    const toY = (s.dateRange.to || '').split('/')[2] || '';
    const yearLabel = fromY === toY ? fromY : `${fromY} — ${toY}`;
    ctx.fillStyle = 'white';
    ctx.font = '800 84px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(t.title, 96, 230);
    ctx.font = '800 64px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(yearLabel, 96, 310);

    // Member badge
    const memberY = getMemberSinceYear();
    if (memberY) {
      const yrs = new Date().getFullYear() - memberY;
      const badgeText = yrs >= 1 ? `${yrs}${t.yearMember}` : `${t.memberSince} ${memberY}`;
      ctx.save();
      ctx.font = '700 30px -apple-system, BlinkMacSystemFont, sans-serif';
      const badgeW = ctx.measureText(badgeText).width + 40;
      const badgeX = 96, badgeY = 350;
      // Gold pill badge
      ctx.fillStyle = 'rgba(255,193,7,0.2)';
      roundRect(ctx, badgeX, badgeY, badgeW, 48, 24);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,193,7,0.6)';
      ctx.lineWidth = 2;
      roundRect(ctx, badgeX, badgeY, badgeW, 48, 24);
      ctx.stroke();
      ctx.fillStyle = '#FFD54F';
      ctx.fillText(badgeText, badgeX + 20, badgeY + 34);
      ctx.restore();
    }

    // Big spend number
    const spendStr = '$' + Math.round(s.totalSpend).toLocaleString('en-US');
    ctx.fillStyle = '#e31837';
    ctx.font = '800 128px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(spendStr, 96, 560);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '500 36px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(t.totalSpent, 96, 610);

    // Stats row
    const stats = [
      { val: String(s.totalReceipts), label: t.receipts },
      { val: String(s.uniqueStores), label: t.storesVisited },
      { val: '$' + Math.round(s.totalSpend / (s.totalReceipts || 1)).toLocaleString(), label: t.avgVisit }
    ];
    const colW = Math.floor((W - 192) / stats.length);
    stats.forEach((st, i) => {
      const x = 96 + i * colW;
      ctx.fillStyle = 'white';
      ctx.font = '700 72px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(st.val, x, 780);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '500 28px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(st.label, x, 820);
    });

    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(96, 890);
    ctx.lineTo(W - 96, 890);
    ctx.stroke();

    // Yearly breakdown (most recent 5 years, descending)
    const yearly = (allStats.yearly || [])
      .slice()
      .sort((a, b) => b.year - a.year)
      .slice(0, 5);

    if (yearly.length > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '600 32px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(t.yearlyBreakdown, 96, 960);

      // Find max spend for bar chart scaling
      const maxSpend = Math.max(...yearly.map(y => y.spend || 0), 1);
      const barMaxW = W - 192 - 400; // leave room for text on both sides

      yearly.forEach((yr, i) => {
        const y = 1020 + i * 72;
        // Year label
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = '700 32px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText(String(yr.year), 96, y + 28);

        // Bar
        const barX = 220;
        const barW = Math.max(8, Math.round((yr.spend / maxSpend) * barMaxW));
        ctx.fillStyle = 'rgba(227,24,55,0.6)';
        roundRect(ctx, barX, y + 6, barW, 28, 6);
        ctx.fill();

        // Spend amount + store count on the right
        const spendText = '$' + Math.round(yr.spend).toLocaleString('en-US');
        const detailText = `${yr.receipts} ${t.receipts} \xB7 ${yr.uniqueStores} ${t.stores}`;
        ctx.fillStyle = 'white';
        ctx.font = '700 28px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText(spendText, barX + barW + 16, y + 28);
        const spendW = ctx.measureText(spendText).width;
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '400 24px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText(detailText, barX + barW + 16 + spendW + 12, y + 28);
      });
    }

    // Footer
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '400 24px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(t.footer, 96, H - 80);
    const rangeStr = `${s.dateRange.from} — ${s.dateRange.to}`;
    const rangeW = ctx.measureText(rangeStr).width;
    ctx.fillText(rangeStr, W - 96 - rangeW, H - 80);

    // Show modal
    showShareModal(canvas, t);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function showShareModal(canvas, t) {
    t = t || getShareLang();
    const overlay = document.createElement('div');
    overlay.className = 'share-overlay';
    overlay.innerHTML = `
      <div class="share-modal">
        <h3>${esc(t.modalTitle)}</h3>
        <div id="sharePreview"></div>
        <div class="share-actions">
          <button class="btn-download">${esc(t.download)}</button>
          <button class="btn-copy">${esc(t.copy)}</button>
          <button class="btn-close">${esc(t.close)}</button>
        </div>
      </div>`;
    overlay.querySelector('#sharePreview').appendChild(canvas);

    overlay.querySelector('.btn-download').addEventListener('click', () => {
      const link = document.createElement('a');
      link.download = 'my-costco-stats.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    });

    overlay.querySelector('.btn-copy').addEventListener('click', async () => {
      try {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        overlay.querySelector('.btn-copy').textContent = t.copied;
        setTimeout(() => { overlay.querySelector('.btn-copy').textContent = t.copy; }, 2000);
      } catch (e) {
        overlay.querySelector('.btn-copy').textContent = 'Failed';
      }
    });

    overlay.querySelector('.btn-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    document.body.appendChild(overlay);
  }

  // --- Export CSV (summary, with formula injection protection) ---
  $('#exportCSV').addEventListener('click', () => {
    if (!requirePro()) return;
    const lines = ['date,time,store,total'];
    allRecords.forEach(r => {
      lines.push([csvCell(r.date), csvCell(r.time), csvCell(r.store), csvCell(r.total)].join(','));
    });
    download(lines.join('\n'), 'costco_receipts.csv', 'text/csv');
  });

  // --- Export Detailed CSV (15-column, compatible with format_receipts_xlsx.py) ---
  $('#exportDetailedCSV').addEventListener('click', () => {
    if (!requirePro()) return;
    const header = 'Date,Time,Warehouse,Store,Item#,Description,Qty,Unit Price,Amount,TaxFlag,Subtotal,Tax,Total,ItemsSold,Payment';
    const lines = [header];

    const sorted = [...allRecords].sort((a, b) => parseUsDate(a.date) - parseUsDate(b.date));

    sorted.forEach(r => {
      if (!r.items || r.items.length === 0) return;

      const warehouse = r.store;
      const storeCol = r.storeWithNum || r.store;
      // Convert time: "08:52am" → "8:52 AM"
      const timeParts = String(r.time).match(/^(\d{1,2}):(\d{2})([ap]m)$/i);
      const fmtTime = timeParts
        ? `${parseInt(timeParts[1])}:${timeParts[2]} ${timeParts[3].toUpperCase()}`
        : r.time;

      r.items.forEach((it, idx) => {
        if (idx === 0) {
          // First item row: all 15 columns
          lines.push([
            csvCell(r.date), csvCell(fmtTime), csvCell(warehouse), csvCell(storeCol),
            csvCell(it.itemNum), csvCell(it.desc),
            csvCell(it.qty != null ? it.qty : ''),
            csvCell(it.unitPrice != null ? it.unitPrice : ''),
            csvCell(it.amount), csvCell(it.taxFlag),
            csvCell(r.subtotal || ''), csvCell(r.tax != null ? r.tax : ''),
            csvCell(r.total), csvCell(r.itemsSold || ''),
            csvCell(r.payment || '')
          ].join(','));
        } else {
          // Subsequent items: only item columns filled
          lines.push([
            csvCell(''), csvCell(''), csvCell(''), csvCell(''),
            csvCell(it.itemNum), csvCell(it.desc),
            csvCell(it.qty != null ? it.qty : ''),
            csvCell(it.unitPrice != null ? it.unitPrice : ''),
            csvCell(it.amount), csvCell(it.taxFlag),
            csvCell(''), csvCell(''), csvCell(''), csvCell(''), csvCell('')
          ].join(','));
        }
      });
    });

    // Generate filename with date range
    const dates = sorted.filter(r => r.items && r.items.length > 0).map(r => r.date);
    let fname = 'costco_receipts_detailed.csv';
    if (dates.length > 0) {
      const d1 = dates[0].split('/');
      const d2 = dates[dates.length - 1].split('/');
      if (d1.length === 3 && d2.length === 3) {
        fname = `costco_receipts_${d1[2]}${d1[0]}${d1[1]}_${d2[2]}${d2[0]}${d2[1]}.csv`;
      }
    }

    download(lines.join('\n'), fname, 'text/csv');
  });

  // --- Export XLSX (multi-sheet formatted workbook) ---
  $('#exportXLSX').addEventListener('click', () => {
    if (!requirePro()) return;
    if (typeof XLSX === 'undefined') {
      alert('XLSX library not loaded. Please reload the page.');
      return;
    }
    const wb = XLSX.utils.book_new();
    const s = allStats.summary;

    // --- Sheet 1: Summary ---
    const summaryData = [
      ['Warehouse Spending Report'],
      [],
      ['Date Range', `${s.dateRange.from} — ${s.dateRange.to}`],
      ['Total Receipts', s.totalReceipts],
      ['Total Spend', s.totalSpend],
      ['Stores Visited', s.uniqueStores],
      ['Avg per Visit', s.totalReceipts > 0 ? Math.round(s.totalSpend / s.totalReceipts * 100) / 100 : 0],
    ];
    if (s.totalItems > 0) summaryData.push(['Total Items', s.totalItems]);
    summaryData.push([], ['Yearly Summary']);
    summaryData.push(['Year', 'Receipts', 'Total Spend', 'Unique Stores', 'Avg / Receipt']);
    (allStats.yearly || []).forEach(y => {
      summaryData.push([y.year, y.receipts, y.spend, y.uniqueStores,
        y.receipts > 0 ? Math.round(y.spend / y.receipts * 100) / 100 : 0]);
    });
    summaryData.push([], ['Quarterly Summary']);
    summaryData.push(['Quarter', 'Receipts', 'Total Spend', 'Unique Stores', 'Avg / Receipt']);
    (allStats.quarterly || []).forEach(q => {
      summaryData.push([q.quarter, q.receipts, q.spend, q.uniqueStores,
        q.receipts > 0 ? Math.round(q.spend / q.receipts * 100) / 100 : 0]);
    });

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    // Format currency cells
    formatCurrencyCells(wsSummary, summaryData, [2, 4]); // cols C and E (0-indexed: 2, 4)
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // --- Sheet 2: Store Ranking ---
    const storeData = [['#', 'Store', 'Visits', 'Total Spend', 'Avg / Visit']];
    (allStats.storeRanking || []).forEach(st => {
      storeData.push([st.rank, st.store, st.visits, st.totalSpend,
        st.visits > 0 ? Math.round(st.totalSpend / st.visits * 100) / 100 : 0]);
    });
    const wsStore = XLSX.utils.aoa_to_sheet(storeData);
    wsStore['!cols'] = [{ wch: 5 }, { wch: 35 }, { wch: 8 }, { wch: 14 }, { wch: 14 }];
    formatCurrencyCells(wsStore, storeData, [3, 4]);
    XLSX.utils.book_append_sheet(wb, wsStore, 'Store Ranking');

    // --- Sheet 3: All Receipts ---
    const rawHeader = hasDetailedData
      ? ['Date', 'Time', 'Store', 'Total', 'Payment', 'Items']
      : ['Date', 'Time', 'Store', 'Total'];
    const rawData = [rawHeader];
    const sorted = [...allRecords].sort((a, b) => parseUsDate(a.date) - parseUsDate(b.date));
    sorted.forEach(r => {
      const row = [r.date, r.time, r.store, r.total];
      if (hasDetailedData) {
        row.push(r.payment || '', r.items ? r.items.length : '');
      }
      rawData.push(row);
    });
    // Totals row
    const totalRow = ['', '', 'TOTAL', sorted.reduce((sum, r) => sum + (r.total || 0), 0)];
    if (hasDetailedData) totalRow.push('', '');
    rawData.push(totalRow);

    const wsRaw = XLSX.utils.aoa_to_sheet(rawData);
    wsRaw['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 35 }, { wch: 14 }, { wch: 18 }, { wch: 8 }];
    formatCurrencyCells(wsRaw, rawData, [3]);
    XLSX.utils.book_append_sheet(wb, wsRaw, 'All Receipts');

    // --- Sheet 4: Item Details (if detailed data exists) ---
    if (hasDetailedData) {
      const itemData = [['Date', 'Time', 'Store', 'Item #', 'Description', 'Qty', 'Unit Price', 'Amount', 'Tax', 'Subtotal', 'Tax Amt', 'Total', 'Payment']];
      sorted.forEach(r => {
        if (!r.items || r.items.length === 0) return;
        r.items.forEach((it, idx) => {
          if (idx === 0) {
            itemData.push([
              r.date, r.time, r.storeWithNum || r.store,
              it.itemNum, it.desc, it.qty ?? '', it.unitPrice ?? '', it.amount, it.taxFlag,
              r.subtotal || '', r.tax ?? '', r.total, r.payment || ''
            ]);
          } else {
            itemData.push([
              '', '', '',
              it.itemNum, it.desc, it.qty ?? '', it.unitPrice ?? '', it.amount, it.taxFlag,
              '', '', '', ''
            ]);
          }
        });
      });
      const wsItems = XLSX.utils.aoa_to_sheet(itemData);
      wsItems['!cols'] = [
        { wch: 12 }, { wch: 10 }, { wch: 35 }, { wch: 10 }, { wch: 40 },
        { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 5 },
        { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 18 }
      ];
      formatCurrencyCells(wsItems, itemData, [6, 7, 9, 10, 11]);
      XLSX.utils.book_append_sheet(wb, wsItems, 'Item Details');
    }

    // Generate filename with date range
    let fname = 'costco_receipts.xlsx';
    if (sorted.length > 0) {
      const d1 = sorted[0].date.split('/');
      const d2 = sorted[sorted.length - 1].date.split('/');
      if (d1.length === 3 && d2.length === 3) {
        fname = `costco_receipts_${d1[2]}${d1[0]}${d1[1]}_${d2[2]}${d2[0]}${d2[1]}.xlsx`;
      }
    }

    // Write and trigger download
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // Helper: set number format on currency columns
  function formatCurrencyCells(ws, data, currCols) {
    // SheetJS community edition doesn't support cell styles, but we ensure
    // numeric values are stored as numbers (not strings) for proper Excel display
    for (let r = 1; r < data.length; r++) {
      for (const c of currCols) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        const cell = ws[cellRef];
        if (cell && typeof cell.v === 'number') {
          cell.t = 'n';
        }
      }
    }
  }

  // --- Export JSON ---
  $('#exportJSON').addEventListener('click', () => {
    if (!requirePro()) return;
    const output = {
      summary: allStats.summary,
      yearly: allStats.yearly,
      quarterly: allStats.quarterly,
      storeRanking: allStats.storeRanking,
      records: allRecords
    };
    download(JSON.stringify(output, null, 2), 'costco_receipts.json', 'application/json');
  });

  function download(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
})();
