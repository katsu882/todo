// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import html from '../index.html?raw';

const STORAGE_KEY = 'todo-app.todos.v1';

// app.js はスクリプト実行時に DOM を掴んでイベントを登録するので、
// テストごとに DOM を作り直してから読み込み直す
const windowListeners = [];

async function setup(todos, hash = '') {
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
  localStorage.clear();
  if (todos) localStorage.setItem(STORAGE_KEY, typeof todos === 'string' ? todos : JSON.stringify(todos));
  history.replaceState(null, '', `/${hash}`);
  vi.resetModules();
  await import('../todo.js');
  await import('../app.js');
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const titles = () => $$('#todo-list .title').map((el) => el.textContent);
const item = (title) => $$('#todo-list .todo-item').find((li) => li.querySelector('.title')?.textContent === title);
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY));

function add(title, due = '') {
  $('#new-title').value = title;
  $('#new-due').value = due;
  $('#new-todo').requestSubmit();
}

function goTo(hash) {
  history.replaceState(null, '', `/${hash}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

const todo = (id, title, extra = {}) => ({ id, title, done: false, due: null, createdAt: 0, ...extra });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 18, 9, 0));
  const original = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type, fn, opts) => {
    windowListeners.push([type, fn, opts]);
    return original(type, fn, opts);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const [type, fn, opts] of windowListeners.splice(0)) window.removeEventListener(type, fn, opts);
  vi.useRealTimers();
});

describe('初期表示', () => {
  it('データがなければ空のメッセージを表示し、ツールバーとフッターを隠す', async () => {
    await setup();
    expect(titles()).toEqual([]);
    expect($('#empty').hidden).toBe(false);
    expect($('#empty').textContent).toContain('まだTODOはありません');
    expect($('#toolbar').hidden).toBe(true);
    expect($('#list-footer').hidden).toBe(true);
    expect($('#summary').textContent).toBe('');
  });

  it('保存済みのデータを読み込んで表示する', async () => {
    await setup([todo('a', '牛乳'), todo('b', '掃除', { done: true })]);
    expect(titles()).toEqual(['牛乳', '掃除']);
    expect(item('掃除').classList.contains('done')).toBe(true);
    expect($('#count').textContent).toBe('残り 1 件');
    expect($('#summary').textContent).toBe('1 / 2 件完了');
    expect($('#progress-bar').style.width).toBe('50%');
  });

  it('壊れた保存データは無視して空の状態で起動する', async () => {
    await setup('{not json');
    expect(titles()).toEqual([]);
    expect($('#empty').hidden).toBe(false);
    add('復旧後の追加');
    expect(stored()).toMatchObject([{ title: '復旧後の追加' }]);
  });

  it('タイトルは HTML として解釈せずテキストとして表示する', async () => {
    await setup([todo('a', '<img src=x onerror=alert(1)>')]);
    expect($('#todo-list img')).toBeNull();
    expect(titles()).toEqual(['<img src=x onerror=alert(1)>']);
  });
});

describe('追加', () => {
  it('入力したタイトルと期限で追加し、保存して入力欄を空にする', async () => {
    await setup();
    add('  牛乳を買う ', '2026-10-19');
    expect(titles()).toEqual(['牛乳を買う']);
    expect(item('牛乳を買う').querySelector('.due').textContent).toBe('明日');
    expect(stored()).toMatchObject([{ title: '牛乳を買う', due: '2026-10-19', done: false }]);
    expect($('#new-title').value).toBe('');
    expect($('#new-due').value).toBe('');
    expect(document.activeElement).toBe($('#new-title'));
  });

  it('空のタイトルは追加しない', async () => {
    await setup();
    add('   ');
    expect(titles()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('「完了」フィルター中に追加すると「すべて」に戻る', async () => {
    await setup([todo('a', '済み', { done: true })], '#/completed');
    add('新しいタスク');
    expect(location.hash).toBe('#/');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(titles()).toEqual(['済み', '新しいタスク']);
  });
});

describe('完了の切り替え', () => {
  it('チェックボックスで完了 / 未完了を切り替える', async () => {
    await setup([todo('a', '牛乳')]);
    item('牛乳').querySelector('[data-role="toggle"]').click();
    expect(item('牛乳').classList.contains('done')).toBe(true);
    expect(stored()[0].done).toBe(true);
    expect($('#count').textContent).toBe('残り 0 件');

    item('牛乳').querySelector('[data-role="toggle"]').click();
    expect(stored()[0].done).toBe(false);
  });

  it('切り替え後もチェックボックスにフォーカスが残る', async () => {
    await setup([todo('a', '牛乳')]);
    const toggle = item('牛乳').querySelector('[data-role="toggle"]');
    toggle.focus();
    toggle.click();
    expect(document.activeElement).toBe(item('牛乳').querySelector('[data-role="toggle"]'));
  });

  it('「すべて完了」で全件を切り替え、全件完了ならチェックが付く', async () => {
    await setup([todo('a', 'A'), todo('b', 'B')]);
    const toggleAll = $('#toggle-all');
    expect(toggleAll.checked).toBe(false);
    toggleAll.click();
    expect(stored().every((t) => t.done)).toBe(true);
    expect($('#toggle-all').checked).toBe(true);
    toggleAll.click();
    expect(stored().every((t) => !t.done)).toBe(true);
  });
});

describe('削除', () => {
  it('削除ボタンで項目を削除する', async () => {
    await setup([todo('a', 'A'), todo('b', 'B')]);
    item('A').querySelector('[data-role="delete"]').click();
    expect(titles()).toEqual(['B']);
    expect(stored().map((t) => t.id)).toEqual(['b']);
  });

  it('「完了済みを削除」は完了済みがあるときだけ表示され、完了済みを削除する', async () => {
    await setup([todo('a', 'A'), todo('b', 'B', { done: true })]);
    const button = $('#clear-completed');
    expect(button.hidden).toBe(false);
    button.click();
    expect(titles()).toEqual(['A']);
    expect(button.hidden).toBe(true);
  });

  it('最後の 1 件を削除すると空の表示に戻る', async () => {
    await setup([todo('a', 'A')]);
    item('A').querySelector('[data-role="delete"]').click();
    expect($('#empty').hidden).toBe(false);
    expect($('#toolbar').hidden).toBe(true);
  });
});

describe('編集', () => {
  const editForm = () => $('#todo-list .edit-form');

  it('編集ボタンで編集フォームを開き、タイトル入力欄にフォーカスする', async () => {
    await setup([todo('a', '牛乳', { due: '2026-10-20' })]);
    item('牛乳').querySelector('[data-role="edit"]').click();
    expect(editForm()).not.toBeNull();
    expect(editForm().querySelector('.edit-title').value).toBe('牛乳');
    expect(editForm().querySelector('.edit-due').value).toBe('2026-10-20');
    expect(document.activeElement).toBe(editForm().querySelector('.edit-title'));
  });

  it('タイトルのダブルクリックで編集を開始する', async () => {
    await setup([todo('a', '牛乳')]);
    item('牛乳').querySelector('.title').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(editForm()).not.toBeNull();
  });

  it('保存するとタイトルと期限を更新し、編集ボタンにフォーカスを戻す', async () => {
    await setup([todo('a', '牛乳')]);
    item('牛乳').querySelector('[data-role="edit"]').click();
    editForm().querySelector('.edit-title').value = '豆乳';
    editForm().querySelector('.edit-due').value = '2026-10-18';
    editForm().requestSubmit();

    expect(editForm()).toBeNull();
    expect(titles()).toEqual(['豆乳']);
    expect(item('豆乳').querySelector('.due').textContent).toBe('今日');
    expect(stored()[0]).toMatchObject({ title: '豆乳', due: '2026-10-18' });
    expect(document.activeElement).toBe(item('豆乳').querySelector('[data-role="edit"]'));
  });

  it('Esc でキャンセルすると変更を破棄する', async () => {
    await setup([todo('a', '牛乳')]);
    item('牛乳').querySelector('[data-role="edit"]').click();
    const input = editForm().querySelector('.edit-title');
    input.value = '豆乳';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(editForm()).toBeNull();
    expect(titles()).toEqual(['牛乳']);
    expect(stored()[0].title).toBe('牛乳');
  });

  it('日本語変換中の Esc では編集をキャンセルしない', async () => {
    await setup([todo('a', '牛乳')]);
    item('牛乳').querySelector('[data-role="edit"]').click();
    editForm()
      .querySelector('.edit-title')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }));
    expect(editForm()).not.toBeNull();
  });

  it('タイトルを空にして保存すると削除せず元に戻す', async () => {
    await setup([todo('a', '牛乳')]);
    item('牛乳').querySelector('[data-role="edit"]').click();
    editForm().querySelector('.edit-title').value = '   ';
    editForm().requestSubmit();
    expect(titles()).toEqual(['牛乳']);
  });

  it('フォームの外へフォーカスが移ると保存する', async () => {
    await setup([todo('a', '牛乳')]);
    item('牛乳').querySelector('[data-role="edit"]').click();
    editForm().querySelector('.edit-title').value = '豆乳';
    $('#new-title').focus();

    expect(editForm()).toBeNull();
    expect(stored()[0].title).toBe('豆乳');
    expect(document.activeElement).toBe($('#new-title'));
  });

  it('フォーム内で期限欄へフォーカスが移っても編集を続ける', async () => {
    await setup([todo('a', '牛乳')]);
    item('牛乳').querySelector('[data-role="edit"]').click();
    editForm().querySelector('.edit-due').focus();
    expect(editForm()).not.toBeNull();
  });

  it('編集を確定しても他の項目の DOM は作り直さない', async () => {
    await setup([todo('a', 'A'), todo('b', 'B')]);
    const otherDelete = item('B').querySelector('[data-role="delete"]');
    item('A').querySelector('[data-role="edit"]').click();
    editForm().querySelector('.edit-title').value = 'A2';
    otherDelete.focus(); // フォーム外へフォーカス → 保存

    expect(otherDelete.isConnected).toBe(true);
    otherDelete.click();
    expect(titles()).toEqual(['A2']);
  });
});

describe('フィルター', () => {
  const data = () => [todo('a', 'A'), todo('b', 'B', { done: true }), todo('c', 'C')];
  const current = () => $('.filters [aria-current="page"]').dataset.filter;

  it.each([
    ['#/', 'all', ['A', 'B', 'C']],
    ['#/active', 'active', ['A', 'C']],
    ['#/completed', 'completed', ['B']],
    ['#/unknown', 'all', ['A', 'B', 'C']],
  ])('URL %s で初期表示を絞り込む', async (hash, filter, expected) => {
    await setup(data(), hash);
    expect(titles()).toEqual(expected);
    expect(current()).toBe(filter);
  });

  it('URL のハッシュが変わると表示を切り替える', async () => {
    await setup(data());
    goTo('#/completed');
    expect(titles()).toEqual(['B']);
    goTo('#/active');
    expect(titles()).toEqual(['A', 'C']);
    expect(current()).toBe('active');
  });

  it('該当する項目がなければフィルターごとのメッセージを表示する', async () => {
    await setup([todo('a', 'A')], '#/completed');
    expect($('#empty').hidden).toBe(false);
    expect($('#empty').textContent).toBe('完了したTODOはまだありません。');

    goTo('#/active');
    item('A').querySelector('[data-role="toggle"]').click();
    expect($('#empty').textContent).toContain('未完了のTODOはありません');
  });
});

describe('期限の表示', () => {
  it.each([
    ['2026-10-17', '昨日', 'overdue'],
    ['2026-10-18', '今日', 'today'],
    ['2026-10-25', '10/25', 'upcoming'],
  ])('%s → %s (%s)', async (due, label, status) => {
    await setup([todo('a', 'A', { due })]);
    const badge = item('A').querySelector('.due');
    expect(badge.textContent).toBe(label);
    expect(badge.classList.contains(status)).toBe(true);
  });

  it('期限がなければバッジを表示しない', async () => {
    await setup([todo('a', 'A')]);
    expect(item('A').querySelector('.due')).toBeNull();
  });
});

describe('別タブとの同期', () => {
  it('storage イベントで最新のデータを読み込み直す', async () => {
    await setup([todo('a', 'A')]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([todo('a', 'A'), todo('b', '別タブで追加')]));
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    expect(titles()).toEqual(['A', '別タブで追加']);
  });

  it('関係ないキーの変更は無視する', async () => {
    await setup([todo('a', 'A')]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    window.dispatchEvent(new StorageEvent('storage', { key: 'other' }));
    expect(titles()).toEqual(['A']);
  });

  it('編集中は入力内容を消さないよう再描画を後回しにする', async () => {
    await setup([todo('a', 'A')]);
    item('A').querySelector('[data-role="edit"]').click();
    const input = $('#todo-list .edit-title');
    input.value = '入力中';
    localStorage.setItem(STORAGE_KEY, JSON.stringify([todo('a', 'A'), todo('b', 'B')]));
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));

    expect(input.isConnected).toBe(true);
    expect(input.value).toBe('入力中');

    $('#todo-list .edit-form').requestSubmit();
    expect(titles()).toEqual(['入力中', 'B']);
  });
});
