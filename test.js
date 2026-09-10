import { requestGPIOAccess } from "./node-webgpio.js";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const gpioAccess = await requestGPIOAccess();
// テストに使用するピン（例として 5 と 6 を使用）
const portIn = gpioAccess.ports.get(5);
const portOut = gpioAccess.ports.get(6);

await portIn.export("in");
await portOut.export("out");

let count = 0;
const TOTAL_LOOPS = 100;

// 入力側の検知イベント
portIn.onchange = (e) => {
  count++;
  console.log(`検知 ${count}回目: ステータス ${e.value}`);
};

console.log(`検証開始: 約20ms間隔で ${TOTAL_LOOPS}回のON/OFFループを実行します...`);

// 出力側からパルスを送信
for (let i = 0; i < TOTAL_LOOPS; i++) {
  await portOut.write(1);
  await sleep(20);
  await portOut.write(0);
  await sleep(20);
}

// 最後のイベントが処理されるまで少し待機
await sleep(500);

console.log("=== 検証結果 ===");
console.log(`送信した変化回数: ${TOTAL_LOOPS * 2} 回 (ON/OFF各${TOTAL_LOOPS}回)`);
console.log(`実際に検知した回数: ${count} 回`);

if (count === TOTAL_LOOPS * 2) {
  console.log("一切の取りこぼしなくエッジを捕捉しています。");
} else {
  console.log(` ${TOTAL_LOOPS * 2 - count} 回の取りこぼしが発生しました。`);
}
