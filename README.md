# node-web-gpio-onoff

W3C browsr and robotics CGの Web GPIO API Draft に準拠した、物理コンピューティングのためのNode.js向けGPIOドライバです。CHIRIMEN環境などでの利用を想定し、従来のAPI互換性を保ちながら、バックエンドの駆動方式を抜本的に刷新しました。

## 旧ドライバ (node-web-gpio) からの主な改善点

* **ソフトウェアポーリングの排除:** 100msごとのファイル読み取り（`setInterval`）を廃止し、OSレベルのエッジ検出（ハードウェア割り込み）に移行しました。
* **高速トラッキング:** 卓球の壁打ちカウンターやフォトインタラプタなど、数ミリ秒〜数十ミリ秒の高速パルス（20msでの動作実証済み）を取りこぼさずに検知可能です。
* **拡張オプションのサポート:** `port.export("in", { debounce: 10, edge: "rising" })` のように、チャタリング防止（デバウンス）や検知エッジの明示的指定が可能になりました。
* **後方互換性:** 既存のプロジェクトコードを書き換えることなく、インポート先の変更のみでドロップイン・リプレイスが可能です。

## 使用しているバックエンド技術

本ライブラリのコアエンジンとして **`onoff`** パッケージを採用しています。

Linuxカーネルの `epoll` システムコールとC++アドオンを利用することで、GPIOピンの電圧変化が起きた瞬間にNode.jsのイベントループへ通知を送るイベントドリブンアーキテクチャを実現しました。これにより、CPU負荷を最抑えつつ、I/O遅延の限界を改善しています。また、カーネル6.6以降で発生するsysfsのポート番号オフセット問題にも対応済みです。

## インストール要件

内部でC++ネイティブアドオンをコンパイルするため、インストール実行時にビルドツールチェーンが必要です。Raspberry Pi OS等の環境で事前に以下を確認してください。

```bash
# ビルドツールのインストール (未導入の場合)
sudo apt update
sudo apt install build-essential python3

# バックエンドエンジンのインストール
npm install onoff
```

## クイックスタート

```javascript
import { requestGPIOAccess } from "./node-webgpio.mjs";

const gpioAccess = await requestGPIOAccess();
const port = gpioAccess.ports.get(17);

// 立ち上がりエッジ検知と10msのチャタリングキャンセルを有効化
await port.export("in", { edge: "rising", debounce: 10 });

port.onchange = (e) => {
  console.log(`検知しました: ${e.value}`);
};
```
