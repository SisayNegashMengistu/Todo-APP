/**
 * storage.js
 * Thin wrapper around LocalStorage. Centralizes keys and handles
 * JSON parsing errors gracefully so a corrupted value never crashes the app.
 */

const Storage = (() => {
  const KEYS = {
    TASKS: 'ledger.tasks.v1',
    THEME: 'ledger.theme.v1',
    PREFS: 'ledger.prefs.v1',
  };

  function isAvailable() {
    try {
      const testKey = '__ledger_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  const available = isAvailable();

  function save(key, value) {
    if (!available) return false;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Storage: failed to save', key, e);
      return false;
    }
  }

  function load(key, fallback) {
    if (!available) return fallback;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.error('Storage: failed to load', key, e);
      return fallback;
    }
  }

  function remove(key) {
    if (!available) return;
    window.localStorage.removeItem(key);
  }

  // ---- Domain-specific helpers ----

  function getTasks() {
    return load(KEYS.TASKS, []);
  }

  function setTasks(tasks) {
    return save(KEYS.TASKS, tasks);
  }

  function getTheme() {
    return load(KEYS.THEME, null);
  }

  function setTheme(theme) {
    return save(KEYS.THEME, theme);
  }

  function getPrefs() {
    return load(KEYS.PREFS, { sort: 'newest', filter: 'all', category: null });
  }

  function setPrefs(prefs) {
    return save(KEYS.PREFS, prefs);
  }

  return {
    available,
    KEYS,
    getTasks,
    setTasks,
    getTheme,
    setTheme,
    getPrefs,
    setPrefs,
  };
})();
