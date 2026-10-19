# TODO

ビルド不要・依存ライブラリなしのシンプルな TODO アプリです。

## 公開URL

- GitHub Pages: https://katsu882.github.io/todo/
- Vercel: https://todo-omega-seven-95.vercel.app

## 使い方

`index.html` をブラウザで開くだけで動きます。

```sh
open index.html
# またはローカルサーバーで
python3 -m http.server 8000   # → http://localhost:8000
```

## 機能

- TODO の追加（期限日は任意）
- 完了 / 未完了の切り替え、すべて完了
- 編集（タイトルのダブルクリックまたは ✎ ボタン。Enter で保存、Esc でキャンセル）
- 削除、完了済みの一括削除
- 絞り込み（すべて / 未完了 / 完了）— URL の `#/active` などで状態を保持
- 期限の表示（今日・明日・期限切れを色分け）と進捗バー
- `localStorage` への自動保存、別タブとの同期
- ダークモード対応、スマホ幅対応

## テスト

[Vitest](https://vitest.dev/) でテストします（Node.js が必要です）。アプリ本体の実行には不要です。

```sh
npm install
npm test            # 1回実行
npm run test:watch  # 変更を監視して再実行
```

- `tests/todo.test.js` — `todo.js` の純粋関数の単体テスト
- `tests/app.test.js` — jsdom 上で `index.html` を読み込み、追加・編集・削除・フィルターなどの操作をテスト

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `index.html` | 画面の骨組み |
| `styles.css` | スタイル（ライト / ダーク） |
| `todo.js` | データ操作の純粋関数（`TodoCore`） |
| `app.js` | 描画・イベント処理・保存 |
