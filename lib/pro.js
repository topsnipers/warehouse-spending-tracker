/**
 * Pro License Module — Warehouse Spending Tracker
 *
 * Key format: WST-PRO-XXXX-XXXX-XXXX (alphanumeric, uppercase)
 * Validation: HMAC-like checksum using a seed derived from the key segments
 * Storage: chrome.storage.local { proLicense: { key, activatedAt } }
 *
 * This is a client-side validation designed to deter casual piracy.
 * Not meant to be unbreakable — just enough friction for a $9.99 product.
 */
const CostcoPro = (() => {
  'use strict';

  const KEY_REGEX = /^WST-PRO-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})$/;
  const STORAGE_KEY = 'proLicense';
  const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion

  // Simple checksum: last segment must be derived from first two segments
  function computeCheck(seg1, seg2) {
    let hash = 0;
    const combined = seg1 + '-' + seg2 + '-WST';
    for (let i = 0; i < combined.length; i++) {
      hash = ((hash << 5) - hash + combined.charCodeAt(i)) | 0;
    }
    // Convert to 4-char check code
    let check = '';
    let h = Math.abs(hash);
    for (let i = 0; i < 4; i++) {
      check += CHARSET[h % CHARSET.length];
      h = Math.floor(h / CHARSET.length);
    }
    return check;
  }

  function validateKey(key) {
    if (!key || typeof key !== 'string') return false;
    const normalized = key.trim().toUpperCase();
    const match = normalized.match(KEY_REGEX);
    if (!match) return false;
    const [, seg1, seg2, seg3] = match;
    return seg3 === computeCheck(seg1, seg2);
  }

  function generateKey() {
    // For development/testing — generates a valid key
    let seg1 = '', seg2 = '';
    for (let i = 0; i < 4; i++) {
      seg1 += CHARSET[Math.floor(Math.random() * CHARSET.length)];
      seg2 += CHARSET[Math.floor(Math.random() * CHARSET.length)];
    }
    const seg3 = computeCheck(seg1, seg2);
    return `WST-PRO-${seg1}-${seg2}-${seg3}`;
  }

  // Check if Pro is activated (async)
  function isPro() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        resolve(false);
        return;
      }
      chrome.storage.local.get([STORAGE_KEY], (data) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        const license = data[STORAGE_KEY];
        if (!license || !license.key) {
          resolve(false);
          return;
        }
        resolve(validateKey(license.key));
      });
    });
  }

  // Activate Pro with a key (async)
  function activate(key) {
    return new Promise((resolve, reject) => {
      if (!validateKey(key)) {
        reject(new Error('Invalid license key'));
        return;
      }
      chrome.storage.local.set({
        [STORAGE_KEY]: {
          key: key.trim().toUpperCase(),
          activatedAt: new Date().toISOString()
        }
      }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(true);
        }
      });
    });
  }

  // Deactivate Pro
  function deactivate() {
    return new Promise((resolve) => {
      chrome.storage.local.remove(STORAGE_KEY, () => resolve());
    });
  }

  return { validateKey, generateKey, isPro, activate, deactivate };
})();

if (typeof module !== 'undefined') module.exports = CostcoPro;
