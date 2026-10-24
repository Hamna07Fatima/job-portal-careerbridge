/* ==========================================================
   storage.js – Mock data layer.
   Prototype only: browser localStorage stands in for a database.
   ========================================================== */
const Store = {
  get(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem('cb_' + key)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, value) { localStorage.setItem('cb_' + key, JSON.stringify(value)); },
  remove(key) { localStorage.removeItem('cb_' + key); }
};
