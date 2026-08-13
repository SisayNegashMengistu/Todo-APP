/**
 * utils.js
 * Small, framework-free helper functions shared across modules.
 * No dependencies on other app modules — safe to load first.
 */

const Utils = (() => {

  /** Generate a reasonably unique id (timestamp + random suffix). */
  function generateId() {
    return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /** Escape a string for safe insertion into innerHTML. */
  function escapeHTML(str = '') {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /** Trim + collapse whitespace. */
  function cleanText(str = '') {
    return str.trim().replace(/\s+/g, ' ');
  }

  /** Return YYYY-MM-DD for "today" in the local timezone (avoids UTC off-by-one). */
  function todayISO() {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    return local.toISOString().slice(0, 10);
  }

  /** Parse a YYYY-MM-DD date string into a local Date at midnight (avoids UTC shift bugs). */
  function parseLocalDate(isoDateStr) {
    if (!isoDateStr) return null;
    const [y, m, d] = isoDateStr.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  /** Is the given YYYY-MM-DD date before today? */
  function isOverdue(isoDateStr) {
    if (!isoDateStr) return false;
    const due = parseLocalDate(isoDateStr);
    const today = parseLocalDate(todayISO());
    return due < today;
  }

  /** Is the given YYYY-MM-DD date today? */
  function isToday(isoDateStr) {
    return !!isoDateStr && isoDateStr === todayISO();
  }

  /** Human-friendly relative label for a due date. */
  function formatDueLabel(isoDateStr) {
    if (!isoDateStr) return '';
    const due = parseLocalDate(isoDateStr);
    const today = parseLocalDate(todayISO());
    const diffDays = Math.round((due - today) / 86400000);

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays > 1 && diffDays <= 6) {
      return due.toLocaleDateString(undefined, { weekday: 'long' });
    }
    if (diffDays < 0) {
      const abs = Math.abs(diffDays);
      return `${abs}d overdue`;
    }
    return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /** Format a full timestamp for display (e.g. "Aug 12, 2026"). */
  function formatDate(isoDateStr) {
    if (!isoDateStr) return '';
    const d = new Date(isoDateStr);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /** Debounce a function call. */
  function debounce(fn, delay = 200) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  /** Animate a numeric counter element from its current value to a target value. */
  function animateCounter(el, toValue, duration = 500) {
    if (!el) return;
    const fromValue = Number(el.dataset.current || 0);
    if (fromValue === toValue) return;
    const startTime = performance.now();

    function tick(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const value = Math.round(fromValue + (toValue - fromValue) * eased);
      el.textContent = value;
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = toValue;
        el.dataset.current = toValue;
      }
    }
    requestAnimationFrame(tick);
  }

  /** Clamp a number between min and max. */
  function clamp(n, min, max) {
    return Math.min(Math.max(n, min), max);
  }

  return {
    generateId,
    escapeHTML,
    cleanText,
    todayISO,
    parseLocalDate,
    isOverdue,
    isToday,
    formatDueLabel,
    formatDate,
    debounce,
    animateCounter,
    clamp,
  };
})();
