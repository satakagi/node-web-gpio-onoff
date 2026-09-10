# node-web-gpio-onoff

[W3C browser and robotics CGの Web GPIO API Draft](https://github.com/browserobo/WebGPIO) に準拠した、物理コンピューティングのためのNode.js向けGPIOドライバです。CHIRIMEN環境などでの利用を想定し、従来のAPI互換性を保ちながらバックエンドの駆動方式を刷新し、イベント駆動の反応性を高めシグナルの取りこぼしを改善しました。

## オリジナルドライバ ([node-web-gpio](https://github.com/chirimen-oh/node-web-gpio)) からの主な改善点
* **`GPIOPort.export()` の割り込み駆動 (epoll) 化:** node-web-gpioで用いられていた100msごとのファイル読み取り（`setInterval`ポーリング）を廃止し、OSレベルのエッジ検出に移行しました。sysfsアクセス時のパーミッション遅延に対するリトライ機構も改善して実装しています。
* **`onchange` イベントの高速トラッキング:** ポーリング起因のレイテンシが改善されたため、卓球の壁打ちカウンターやフォトインタラプタ等で発生する数十ミリ秒の高速パルス（20msでの動作検証実施）を取りこぼさずに検知可能です。
* **`GPIOPort.export()` の引数拡張機能:** 第二引数として `port.export("in", { debounce: 10, edge: "rising" })` のように、ハードウェア割り込み時のエッジ指定やチャタリング防止（ソフトウェアデバウンス）を指定できるようになりました。
* **`GPIOAccess.unexportAll()` の修正:** 一度も `export` されていないポートが存在すると処理が途中で停止（Promiseがreject）してしまう既存の課題を修正し、ポートを開放できるようにしました。
* **`GPIOPort.write()` などの後方互換性:** `write()` の緩い型チェック（`parseUint16` への委譲）やW3C仕様外の例外スロー挙動をそのまま維持しているため、既存プロジェクトのインポート先を変更するだけでドロップイン・リプレイスが可能です。
  
## 使用しているバックエンド技術

本ライブラリのコアエンジンとして **`onoff`** パッケージを採用しています。

Linuxカーネルの `epoll` システムコールとC++アドオンを利用することで、GPIOピンの電圧変化が起きた瞬間にNode.jsのイベントループへ通知を送るイベントドリブンアーキテクチャを実現しました。これにより、CPU負荷を最小限に抑えつつ、I/O遅延の限界を改善しています。また、カーネル6.6以降で発生するsysfsのポート番号オフセット問題にも対応済みです。

## インストール要件

内部でC++ネイティブアドオンをコンパイルするため、インストール実行時にビルドツールチェーンが必要です。Raspberry Pi OS等の環境で事前に以下を確認してください。

```bash
# ビルドツールのインストール (未導入の場合)
sudo apt update
sudo apt install build-essential python3

# バックエンドエンジンのインストール
npm install onoff
```

また、本ライブラリは ES Modules (ESM) を使用しています。もし.js 拡張子のまま import を機能させるには、ご利用のプロジェクトの `package.json` に以下の設定を追加してください。

```JSON
{
  "type": "module"
}
```

## `GPIOPort.export()` の拡張オプション

ポートを入力 (`"in"`) としてエクスポートする際、第二引数にオプションオブジェクトを渡すことで、ハードウェア割り込みの挙動を細かく制御できます。

```javascript
// 例: 立ち上がりエッジのみ検知、10msのデバウンス、負論理を有効化
await port.export("in", { edge: "rising", debounce: 10, activeLow: true });
```

| プロパティ | 型 | デフォルト | 説明 |
| :--- | :--- | :--- | :--- |
| **`edge`** | String | `"both"` | `onchange` イベントを発火させる電圧変化のタイミングを指定します。<br>・`"rising"`: LOW から HIGH への変化時（立ち上がり）<br>・`"falling"`: HIGH から LOW への変化時（立ち下がり）<br>・`"both"`: 両方の変化時 |
| **`debounce`** | Number | `0` (無効) | チャタリング（機械式スイッチの微細なオンオフ反復）を無視する時間をミリ秒 (ms) で指定します。タクトスイッチ等を使用する際に有効です。 |
| **`activeLow`** | Boolean | `false` | `true` に設定すると値の論理が反転します（HIGHのとき `0`、LOWのとき `1` を返します）。プルアップ回路等でコードを直感的に保ちたい場合に便利です。 |

> **注意:** `edge`, `debounce`, `activeLow` オプションは、方向が `"in"` の場合のみ有効です。`"out"` の場合は無視されます。

## クイックスタート

```javascript
import { requestGPIOAccess } from "./node-webgpio.js";

const gpioAccess = await requestGPIOAccess();
const port = gpioAccess.ports.get(17);

// 立ち上がりエッジ検知と10msのチャタリングキャンセルを有効化
await port.export("in", { edge: "rising", debounce: 10 });

port.onchange = (e) => {
  console.log(`検知しました: ${e.value}`);
};
```
