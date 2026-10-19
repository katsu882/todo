// TODO データ操作の純粋関数群。DOM には依存しない。
// すべての関数は元の配列を変更せず、新しい配列を返す。
(function (root) {
  'use strict';

  const MAX_TITLE_LENGTH = 200;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const DAY_MS = 24 * 60 * 60 * 1000;

  function generateId() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') {
      return root.crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function normalizeTitle(title) {
    return String(title ?? '').trim().slice(0, MAX_TITLE_LENGTH);
  }

  function normalizeDue(due) {
    return typeof due === 'string' && DATE_RE.test(due) ? due : null;
  }

  function addTodo(todos, title, due, id = generateId(), now = Date.now()) {
    const normalized = normalizeTitle(title);
    if (!normalized) return todos;
    return [...todos, { id, title: normalized, done: false, due: normalizeDue(due), createdAt: now }];
  }

  function toggleTodo(todos, id) {
    return todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
  }

  function updateTodo(todos, id, changes) {
    return todos.map((t) => {
      if (t.id !== id) return t;
      const next = { ...t };
      if ('title' in changes) {
        const title = normalizeTitle(changes.title);
        if (title) next.title = title;
      }
      if ('due' in changes) next.due = normalizeDue(changes.due);
      if ('done' in changes) next.done = Boolean(changes.done);
      return next;
    });
  }

  function removeTodo(todos, id) {
    return todos.filter((t) => t.id !== id);
  }

  function clearCompleted(todos) {
    return todos.filter((t) => !t.done);
  }

  function setAllDone(todos, done) {
    return todos.map((t) => (t.done === done ? t : { ...t, done }));
  }

  function filterTodos(todos, filter) {
    switch (filter) {
      case 'active':
        return todos.filter((t) => !t.done);
      case 'completed':
        return todos.filter((t) => t.done);
      default:
        return todos;
    }
  }

  function countActive(todos) {
    return todos.reduce((n, t) => (t.done ? n : n + 1), 0);
  }

  // ローカルタイムゾーンでの日付を YYYY-MM-DD で返す
  function todayString(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function dayNumber(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / DAY_MS;
  }

  // 期限の表示ラベルと状態 ('done' | 'overdue' | 'today' | 'upcoming') を返す
  function dueInfo(todo, today) {
    if (!todo.due) return null;
    const diff = dayNumber(todo.due) - dayNumber(today);
    let label;
    if (diff === 0) label = '今日';
    else if (diff === 1) label = '明日';
    else if (diff === -1) label = '昨日';
    else {
      const [y, m, d] = todo.due.split('-').map(Number);
      label = y === Number(today.slice(0, 4)) ? `${m}/${d}` : `${y}/${m}/${d}`;
    }
    let status;
    if (todo.done) status = 'done';
    else if (diff < 0) status = 'overdue';
    else if (diff === 0) status = 'today';
    else status = 'upcoming';
    return { label, status };
  }

  // 保存データを読み込むときに、壊れた要素を取り除いて形を揃える
  function sanitizeTodos(data) {
    if (!Array.isArray(data)) return [];
    const seen = new Set();
    const result = [];
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      if (typeof item.id !== 'string' || !item.id || seen.has(item.id)) continue;
      const title = normalizeTitle(item.title);
      if (!title) continue;
      seen.add(item.id);
      result.push({
        id: item.id,
        title,
        done: Boolean(item.done),
        due: normalizeDue(item.due),
        createdAt: Number.isFinite(item.createdAt) ? item.createdAt : 0,
      });
    }
    return result;
  }

  root.TodoCore = {
    MAX_TITLE_LENGTH,
    addTodo,
    toggleTodo,
    updateTodo,
    removeTodo,
    clearCompleted,
    setAllDone,
    filterTodos,
    countActive,
    todayString,
    dueInfo,
    sanitizeTodos,
  };
})(typeof window !== 'undefined' ? window : globalThis);
