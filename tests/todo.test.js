import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';

// todo.js はブラウザ用のスクリプトなので、読み込むと globalThis.TodoCore が定義される
let C;
beforeAll(async () => {
  await import('../todo.js');
  C = globalThis.TodoCore;
});

const sample = () => [
  { id: 'a', title: '牛乳を買う', done: false, due: '2026-10-20', createdAt: 1 },
  { id: 'b', title: '掃除', done: true, due: null, createdAt: 2 },
  { id: 'c', title: '洗濯', done: false, due: null, createdAt: 3 },
];

describe('addTodo', () => {
  it('タイトルの前後の空白を除いて末尾に追加する', () => {
    const todos = C.addTodo([], '  牛乳を買う  ', '2026-10-20', 'a', 1);
    expect(todos).toEqual([{ id: 'a', title: '牛乳を買う', done: false, due: '2026-10-20', createdAt: 1 }]);
  });

  it('空白だけのタイトルは追加せず、同じ配列を返す', () => {
    const todos = sample();
    expect(C.addTodo(todos, '   ', '')).toBe(todos);
    expect(C.addTodo(todos, null, '')).toBe(todos);
  });

  it('不正な期限は null にする', () => {
    expect(C.addTodo([], 'x', 'nope', 'x', 1)[0].due).toBeNull();
    expect(C.addTodo([], 'x', '', 'x', 1)[0].due).toBeNull();
    expect(C.addTodo([], 'x', '2026/10/20', 'x', 1)[0].due).toBeNull();
  });

  it(`タイトルを ${200} 文字に切り詰める`, () => {
    const [todo] = C.addTodo([], 'あ'.repeat(250), '', 'x', 1);
    expect(todo.title).toHaveLength(C.MAX_TITLE_LENGTH);
  });

  it('id と作成日時を省略すると自動で設定する', () => {
    const todos = C.addTodo(C.addTodo([], 'one'), 'two');
    expect(typeof todos[0].id).toBe('string');
    expect(todos[0].id).not.toBe(todos[1].id);
    expect(Number.isFinite(todos[0].createdAt)).toBe(true);
  });

  it('元の配列を変更しない', () => {
    const todos = sample();
    const snapshot = structuredClone(todos);
    C.addTodo(todos, 'new');
    expect(todos).toEqual(snapshot);
  });
});

describe('toggleTodo', () => {
  it('指定した項目の完了状態だけを反転する', () => {
    const todos = sample();
    const next = C.toggleTodo(todos, 'a');
    expect(next.map((t) => t.done)).toEqual([true, true, false]);
    expect(next[1]).toBe(todos[1]);
    expect(todos[0].done).toBe(false);
  });

  it('存在しない id では何も変わらない', () => {
    expect(C.toggleTodo(sample(), 'zzz')).toEqual(sample());
  });
});

describe('updateTodo', () => {
  it('タイトルと期限を更新する', () => {
    const next = C.updateTodo(sample(), 'c', { title: ' 布団を干す ', due: '2026-11-01' });
    expect(next[2]).toMatchObject({ title: '布団を干す', due: '2026-11-01' });
  });

  it('空のタイトルは無視して元のタイトルを残す', () => {
    const next = C.updateTodo(sample(), 'a', { title: '  ' });
    expect(next[0].title).toBe('牛乳を買う');
  });

  it('期限を空にすると null になる', () => {
    expect(C.updateTodo(sample(), 'a', { due: '' })[0].due).toBeNull();
  });

  it('done を真偽値として設定する', () => {
    expect(C.updateTodo(sample(), 'a', { done: 1 })[0].done).toBe(true);
  });

  it('渡されていない項目は変更しない', () => {
    const next = C.updateTodo(sample(), 'a', {});
    expect(next[0]).toEqual(sample()[0]);
  });
});

describe('removeTodo / clearCompleted / setAllDone', () => {
  it('removeTodo は指定した項目を削除する', () => {
    expect(C.removeTodo(sample(), 'b').map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('clearCompleted は完了済みの項目を削除する', () => {
    expect(C.clearCompleted(sample()).map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('setAllDone はすべての項目の完了状態を揃える', () => {
    expect(C.setAllDone(sample(), true).every((t) => t.done)).toBe(true);
    expect(C.setAllDone(sample(), false).every((t) => !t.done)).toBe(true);
  });

  it('setAllDone は状態が変わらない項目の参照を保つ', () => {
    const todos = sample();
    const next = C.setAllDone(todos, true);
    expect(next[1]).toBe(todos[1]);
    expect(next[0]).not.toBe(todos[0]);
  });
});

describe('filterTodos / countActive', () => {
  it.each([
    ['all', ['a', 'b', 'c']],
    ['active', ['a', 'c']],
    ['completed', ['b']],
    ['unknown', ['a', 'b', 'c']],
  ])('filter=%s', (filter, ids) => {
    expect(C.filterTodos(sample(), filter).map((t) => t.id)).toEqual(ids);
  });

  it('countActive は未完了の件数を返す', () => {
    expect(C.countActive(sample())).toBe(2);
    expect(C.countActive([])).toBe(0);
  });
});

describe('todayString', () => {
  it('ローカル日付を YYYY-MM-DD で返す（ゼロ埋め）', () => {
    expect(C.todayString(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(C.todayString(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('引数を省略すると現在日時を使う', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 18, 9, 0));
    expect(C.todayString()).toBe('2026-10-18');
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

describe('dueInfo', () => {
  const today = '2026-10-18';
  const info = (due, done = false) => C.dueInfo({ due, done }, today);

  it('期限なしは null', () => {
    expect(info(null)).toBeNull();
  });

  it.each([
    ['2026-10-18', { label: '今日', status: 'today' }],
    ['2026-10-19', { label: '明日', status: 'upcoming' }],
    ['2026-10-17', { label: '昨日', status: 'overdue' }],
    ['2026-10-10', { label: '10/10', status: 'overdue' }],
    ['2026-12-25', { label: '12/25', status: 'upcoming' }],
    ['2027-01-01', { label: '2027/1/1', status: 'upcoming' }],
    ['2025-03-04', { label: '2025/3/4', status: 'overdue' }],
  ])('%s', (due, expected) => {
    expect(info(due)).toEqual(expected);
  });

  it('完了済みは期限切れでも status が done になる', () => {
    expect(info('2026-10-10', true)).toEqual({ label: '10/10', status: 'done' });
  });

  it('月末・年末をまたいでも日数を正しく数える', () => {
    expect(C.dueInfo({ due: '2026-11-01' }, '2026-10-31').label).toBe('明日');
    expect(C.dueInfo({ due: '2027-01-01' }, '2026-12-31').label).toBe('明日');
  });
});

describe('sanitizeTodos', () => {
  it('配列でなければ空配列を返す', () => {
    expect(C.sanitizeTodos(null)).toEqual([]);
    expect(C.sanitizeTodos({})).toEqual([]);
    expect(C.sanitizeTodos('[]')).toEqual([]);
  });

  it('壊れた要素や重複 id を取り除き、形を揃える', () => {
    const result = C.sanitizeTodos([
      null,
      'str',
      { id: 'a', title: ' x ' },
      { id: 'a', title: 'dup' },
      { id: 1, title: 'number id' },
      { id: '', title: 'empty id' },
      { id: 'c', title: '  ' },
      { id: 'd', title: 'ok', done: 1, due: 'bad', createdAt: 5 },
      { id: 'e', title: 'due', due: '2026-10-20', createdAt: 'x' },
    ]);
    expect(result).toEqual([
      { id: 'a', title: 'x', done: false, due: null, createdAt: 0 },
      { id: 'd', title: 'ok', done: true, due: null, createdAt: 5 },
      { id: 'e', title: 'due', done: false, due: '2026-10-20', createdAt: 0 },
    ]);
  });

  it('余分なプロパティは捨てる', () => {
    const [todo] = C.sanitizeTodos([{ id: 'a', title: 'x', extra: '<script>' }]);
    expect(todo).not.toHaveProperty('extra');
  });
});

describe('id の生成', () => {
  it('crypto.randomUUID が使えない環境でも一意な id を作る', async () => {
    vi.resetModules();
    vi.stubGlobal('crypto', undefined);
    const saved = globalThis.TodoCore;
    try {
      await import('../todo.js');
      const core = globalThis.TodoCore;
      const todos = core.addTodo(core.addTodo([], 'one'), 'two');
      expect(todos[0].id).toMatch(/^[a-z0-9]+$/);
      expect(todos[0].id).not.toBe(todos[1].id);
    } finally {
      vi.unstubAllGlobals();
      globalThis.TodoCore = saved;
    }
  });
});
