// 画面の描画とイベント処理。データ操作は todo.js の TodoCore に任せる。
(function () {
  'use strict';

  const {
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
  } = window.TodoCore;

  const STORAGE_KEY = 'todo-app.todos.v1';
  const FILTERS = { '#/': 'all', '#/active': 'active', '#/completed': 'completed' };
  const EMPTY_MESSAGES = {
    all: 'まだTODOはありません。上の入力欄から追加しましょう。',
    active: '未完了のTODOはありません。お疲れさまでした！',
    completed: '完了したTODOはまだありません。',
  };
  const ICONS = {
    edit: 'M4 20h4L19 9l-4-4L4 16v4z M13.5 6.5l4 4',
    delete: 'M6 6l12 12M18 6L6 18',
  };

  const els = {
    form: document.getElementById('new-todo'),
    title: document.getElementById('new-title'),
    due: document.getElementById('new-due'),
    summary: document.getElementById('summary'),
    progressBar: document.getElementById('progress-bar'),
    toolbar: document.getElementById('toolbar'),
    toggleAll: document.getElementById('toggle-all'),
    filters: document.querySelectorAll('[data-filter]'),
    list: document.getElementById('todo-list'),
    empty: document.getElementById('empty'),
    footer: document.getElementById('list-footer'),
    count: document.getElementById('count'),
    clearCompleted: document.getElementById('clear-completed'),
  };

  const state = {
    todos: load(),
    filter: filterFromHash(),
    editingId: null,
  };

  // id -> { todo, editing, today, node }。変化のない項目は DOM を作り直さない
  const nodeCache = new Map();

  function load() {
    try {
      return sanitizeTodos(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
    } catch {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.todos));
    } catch {
      // プライベートモードなどで保存できない場合は、メモリ上でのみ動作する
    }
  }

  function commit(todos) {
    state.todos = todos;
    save();
    render();
  }

  function filterFromHash() {
    return FILTERS[location.hash] || 'all';
  }

  // ---- DOM ヘルパー ----

  function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('aria-')) node.setAttribute(key, value);
      else node[key] = value;
    }
    node.append(...children);
    return node;
  }

  function icon(name) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', ICONS[name]);
    svg.append(path);
    return svg;
  }

  function itemId(node) {
    return node.closest('.todo-item')?.dataset.id;
  }

  function findItem(id) {
    return [...els.list.children].find((li) => li.dataset.id === id);
  }

  // ---- 描画 ----

  function renderItem(todo, today) {
    const li = h('li', { className: 'todo-item', dataset: { id: todo.id } });
    li.classList.toggle('done', todo.done);

    if (todo.id === state.editingId) {
      li.classList.add('editing');
      li.append(renderEditForm(todo));
      return li;
    }

    const toggle = h('input', {
      type: 'checkbox',
      checked: todo.done,
      dataset: { role: 'toggle' },
      'aria-label': `「${todo.title}」を${todo.done ? '未完了に戻す' : '完了にする'}`,
    });
    const title = h('span', { className: 'title', dataset: { role: 'title' }, title: 'ダブルクリックで編集' }, todo.title);
    li.append(toggle, title);

    const due = dueInfo(todo, today);
    if (due) {
      li.append(h('span', { className: `due ${due.status}`, title: `期限: ${todo.due}` }, due.label));
    }

    li.append(
      h('button', { type: 'button', className: 'icon-button', dataset: { role: 'edit' }, 'aria-label': `「${todo.title}」を編集` }, icon('edit')),
      h('button', { type: 'button', className: 'icon-button delete', dataset: { role: 'delete' }, 'aria-label': `「${todo.title}」を削除` }, icon('delete')),
    );
    return li;
  }

  function renderEditForm(todo) {
    const title = h('input', {
      type: 'text',
      className: 'edit-title',
      value: todo.title,
      maxLength: MAX_TITLE_LENGTH,
      'aria-label': 'タイトルを編集',
    });
    const due = h('input', { type: 'date', className: 'edit-due', value: todo.due || '', 'aria-label': '期限を編集' });
    const form = h('form', { className: 'edit-form' }, title, due, h('button', { type: 'submit', className: 'primary small' }, '保存'));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      finishEdit(todo.id, title.value, due.value, true);
    });
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !e.isComposing) cancelEdit(todo.id);
    });
    // フォームの外にフォーカスが移ったら保存する
    form.addEventListener('focusout', (e) => {
      if (!form.contains(e.relatedTarget)) finishEdit(todo.id, title.value, due.value, false);
    });
    return form;
  }

  function getNode(todo, today) {
    const editing = todo.id === state.editingId;
    const cached = nodeCache.get(todo.id);
    if (cached && cached.todo === todo && cached.editing === editing && cached.today === today) {
      return cached.node;
    }
    const node = renderItem(todo, today);
    nodeCache.set(todo.id, { todo, editing, today, node });
    return node;
  }

  function renderList(visible, today) {
    const nodes = visible.map((t) => getNode(t, today));
    const keep = new Set(nodes);
    for (const child of [...els.list.children]) {
      if (!keep.has(child)) child.remove();
    }
    // 位置が変わったものだけを動かす（クリック中のボタンなどを壊さないため）
    nodes.forEach((node, i) => {
      const current = els.list.children[i];
      if (current !== node) els.list.insertBefore(node, current || null);
    });
    const ids = new Set(state.todos.map((t) => t.id));
    for (const id of nodeCache.keys()) {
      if (!ids.has(id)) nodeCache.delete(id);
    }
  }

  function render() {
    const today = todayString();
    const visible = filterTodos(state.todos, state.filter);
    const total = state.todos.length;
    const active = countActive(state.todos);
    const done = total - active;

    // 再描画で置き換わった項目でも、同じ操作対象にフォーカスを戻す
    const focused = document.activeElement;
    const focusId = els.list.contains(focused) ? itemId(focused) : null;
    const focusRole = focused?.dataset?.role;

    renderList(visible, today);

    if (focusId && focusRole && !els.list.contains(document.activeElement)) {
      findItem(focusId)?.querySelector(`[data-role="${focusRole}"]`)?.focus();
    }
    if (state.editingId) {
      const input = findItem(state.editingId)?.querySelector('.edit-title');
      if (input && document.activeElement !== input && !input.form.contains(document.activeElement)) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }

    els.summary.textContent = total ? `${done} / ${total} 件完了` : '';
    els.progressBar.style.width = total ? `${(done / total) * 100}%` : '0%';
    els.toolbar.hidden = total === 0;
    els.footer.hidden = total === 0;
    els.toggleAll.checked = total > 0 && active === 0;
    els.count.textContent = `残り ${active} 件`;
    els.clearCompleted.hidden = done === 0;
    els.empty.hidden = visible.length > 0;
    els.empty.textContent = EMPTY_MESSAGES[total === 0 ? 'all' : state.filter];
    els.filters.forEach((a) => {
      if (a.dataset.filter === state.filter) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  // ---- 編集 ----

  function startEdit(id) {
    state.editingId = id;
    render();
  }

  function finishEdit(id, title, due, restoreFocus) {
    // Enter 確定後の focusout などで二重に呼ばれても一度だけ処理する
    if (state.editingId !== id) return;
    state.editingId = null;
    if (title.trim()) commit(updateTodo(state.todos, id, { title, due }));
    else render(); // 空にされた場合は削除せず元のタイトルに戻す
    if (restoreFocus) findItem(id)?.querySelector('[data-role="edit"]')?.focus();
  }

  function cancelEdit(id) {
    if (state.editingId !== id) return;
    state.editingId = null;
    render();
    findItem(id)?.querySelector('[data-role="edit"]')?.focus();
  }

  // ---- イベント ----

  els.title.maxLength = MAX_TITLE_LENGTH;

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const next = addTodo(state.todos, els.title.value, els.due.value);
    if (next !== state.todos) {
      els.title.value = '';
      els.due.value = '';
      // 追加した項目が見えるよう「完了」フィルター中なら「すべて」に戻す
      if (state.filter === 'completed') location.hash = '#/';
      commit(next);
    }
    els.title.focus();
  });

  els.list.addEventListener('change', (e) => {
    if (e.target.dataset.role === 'toggle') commit(toggleTodo(state.todos, itemId(e.target)));
  });

  els.list.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-role]');
    if (!button) return;
    const id = itemId(button);
    if (button.dataset.role === 'delete') commit(removeTodo(state.todos, id));
    else if (button.dataset.role === 'edit') startEdit(id);
  });

  els.list.addEventListener('dblclick', (e) => {
    if (e.target.dataset.role === 'title') startEdit(itemId(e.target));
  });

  els.toggleAll.addEventListener('change', () => {
    commit(setAllDone(state.todos, els.toggleAll.checked));
  });

  els.clearCompleted.addEventListener('click', () => {
    commit(clearCompleted(state.todos));
    els.title.focus();
  });

  window.addEventListener('hashchange', () => {
    state.filter = filterFromHash();
    render();
  });

  // 別タブでの変更を反映する（編集中は入力内容を消さないよう描画を後回しにする）
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    state.todos = load();
    if (state.editingId === null) render();
  });

  render();
})();
