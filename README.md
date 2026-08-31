# MMM-EarthquakeMonitorJP

[MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror) 用の日本向け地震情報モジュールです。
[P2P地震情報 API](https://www.p2pquake.net/) の WebSocket / REST API を使用し、リアルタイムで地震・津波・緊急地震速報を表示します。

## 主な機能

- **リアルタイム地震情報** — WebSocket 接続で低遅延のデータ受信
- **緊急地震速報（EEW）** — 警報レベルの緊急地震速報を点滅表示
- **津波予報** — 大津波警報・津波警報・津波注意報をカラーで表示
- **震度バッジ** — 気象庁準拠のカラーで震度を視覚的に表示
- **2つの表示モード** — 常時一覧表示（`list`）と、発生時だけ現れる通知表示（`notification`）
- **全画面アラート** — 震度5弱以上・EEW・津波警報で画面全体に警告を表示
- **テストモード** — 実際の地震を待たずに表示を検証（ホットキー / コンソール / 他モジュール連携）
- **自動再接続** — WebSocket 切断時に自動で再接続（reconnecting-websocket 使用）
- **REST API フォールバック** — WebSocket 不通時でも定期ポーリングで情報取得
- **重複排除** — 同一情報の二重表示を防止

## 表示モード

### `displayMode: "list"`（デフォルト・従来動作）

地震情報を常に一覧で表示します。`top_right` などのサイドに配置する用途に向いています。

```
┌──────────────────────────────────┐
│  ⚠ 緊急地震速報（警報）          │
│    宗谷地方北部  M5.5            │
│    上川地方北部(5弱)             │
├──────────────────────────────────┤
│  🌊 津波注意報                   │
│  【津波注意報】青森県太平洋沿岸  │
│    予想高さ: １ｍ                │
├──────────────────────────────────┤
│ [3] 宮古島近海                   │
│     M4.0 / 深さ 50km / 20:53    │
│                                  │
│ [2] 千葉県北西部                 │
│     M3.2 / 深さ 80km / 18:22    │
└──────────────────────────────────┘
```

### `displayMode: "notification"`（通知モード）

**平常時は何も表示せず、レイアウトを一切占有しません**（`display:none` / 高さ 0px）。
地震が発生したときだけ通知が現れ、一定時間後に自動で消えます。
`top_bar` や `top_center` に置いて、普段はスッキリさせたい場合に最適です。

```
　　　　　　　　　（平常時は完全に非表示）

［発生時］
┌────────────────────────────────────────────────────────┐
│ [3] 震度3 宮古島近海  M4.0 / 深さ 50km / 17:42        │
└────────────────────────────────────────────────────────┘
  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔  ← 残り時間バー
```

複数同時発生時は重大度順（EEW → 津波 → 震度）に並びます。

### 全画面アラート（`fullscreenAlert: true`）

大きな地震・EEW・津波警報のときに、MagicMirror の `alert` モジュール風の
オーバーレイを画面全体に表示します。離れた場所からでも視認できます。

```
╔════════════════════════════════════════════════╗
║                     🌏                         ║
║              震度7 宮城県沖                    ║
║          最大震度  ┃    7    ┃                 ║
║      M8.1 / 深さ 20km / 17:42 / 津波予報あり   ║
║        ［ 身の安全を確保してください ］        ║
╚════════════════════════════════════════════════╝
```

## インストール

```bash
cd ~/MagicMirror/modules
git clone https://github.com/Ryuto-dev/MMM-EarthquakeAlerts_forJapan.git MMM-EarthquakeMonitorJP
cd MMM-EarthquakeMonitorJP
npm install --omit=dev
```

## アップデート

```bash
cd ~/MagicMirror/modules/MMM-EarthquakeMonitorJP
git pull
npm install --omit=dev
```

## 設定

`~/MagicMirror/config/config.js` の `modules` 配列に追加してください。

### 基本設定（最小構成）

```js
{
  module: "MMM-EarthquakeMonitorJP",
  position: "top_right",
  header: "地震情報",
  config: {}
}
```

### 詳細設定例

```js
{
  module: "MMM-EarthquakeMonitorJP",
  position: "top_right",
  header: "地震情報",
  config: {
    maxQuakes: 5,           // 表示する最大件数
    maxAge: 24,             // 表示する最大経過時間（時間）
    minScale: 30,           // 表示する最小震度（30 = 震度3以上）
    showEEW: true,          // 緊急地震速報を表示
    showTsunami: true,      // 津波予報を表示
    showQuakeInfo: true,    // 地震情報を表示
    showPointDetails: true, // 観測地点の詳細を表示
    showTimestamp: true,    // 時刻を表示
    showMagnitude: true,    // マグニチュードを表示
    showDepth: true,        // 震源の深さを表示
    showTsunamiStatus: true,// 津波の有無を表示
    compactMode: false,     // コンパクト表示
    colorizeByScale: true,  // 震度に応じた色分け
    blinkOnEEW: true,       // EEW時の点滅アニメーション
    showIcon: true,         // 震度バッジを表示
    useWebSocket: true,     // WebSocket を使用
    useRESTFallback: true,  // REST API をフォールバックとして使用
    restUpdateInterval: 300, // REST ポーリング間隔（秒）
    animationSpeed: 1000,   // DOM更新アニメーション速度（ms）
  }
}
```

### 通知モードの設定例（おすすめ）

平常時は非表示、地震発生時のみ `top_bar` に通知を出す構成です。

```js
{
  module: "MMM-EarthquakeMonitorJP",
  position: "top_bar",
  // header は指定しないでください（平常時に見出しだけ残ってしまいます）
  config: {
    displayMode: "notification",

    minScale: 30,               // 震度3未満は無視
    notificationDuration: 300,  // 5分間表示して自動で消える
    notificationMaxItems: 1,    // 同時に表示する通知は1件
    notificationFreshness: 600, // 10分以上前の地震は通知しない
    notificationCompact: true,  // 1行レイアウト（top_bar 向き）

    // 大きな地震だけ全画面で知らせる
    fullscreenAlert: true,
    fullscreenMinScale: 45,     // 震度5弱以上
    fullscreenDuration: 30,     // 30秒表示
  }
}
```

> **ヒント:** 通知モードでは `header` を設定しないでください。MagicMirror は
> モジュール本体が非表示でもヘッダーを描画するため、平常時に見出しだけが
> 残ってしまいます。

### 全画面アラートのみ利用する例

一覧は `top_right` に常時表示しつつ、大地震のときだけ全画面警告を出す構成です。
全画面アラートは `list` モードでも動作します。

```js
{
  module: "MMM-EarthquakeMonitorJP",
  position: "top_right",
  header: "地震情報",
  config: {
    displayMode: "list",
    fullscreenAlert: true,
    fullscreenMinScale: 45,        // 震度5弱以上
    fullscreenOnEEW: true,         // EEW は常に全画面
    fullscreenOnTsunamiWarning: true, // 津波警報以上は常に全画面
    fullscreenDuration: 30,
  }
}
```

## 設定オプション一覧

### 表示モード

| オプション | 説明 | 型 | デフォルト |
|---|---|---|---|
| `displayMode` | `"list"`（常時一覧表示）または `"notification"`（発生時のみ通知） | `string` | `"list"` |

### 表示設定

| オプション | 説明 | 型 | デフォルト |
|---|---|---|---|
| `maxQuakes` | 表示する地震情報の最大件数 | `int` | `5` |
| `maxAge` | 表示する情報の最大経過時間（時間） | `int` | `24` |
| `minScale` | 表示する最小震度 | `int` | `-1`（すべて） |
| `animationSpeed` | DOM更新時のアニメーション速度（ms） | `int` | `1000` |

### 表示トグル

| オプション | 説明 | 型 | デフォルト |
|---|---|---|---|
| `showEEW` | 緊急地震速報（警報）を表示 | `bool` | `true` |
| `showTsunami` | 津波予報を表示 | `bool` | `true` |
| `showQuakeInfo` | 地震情報を表示 | `bool` | `true` |
| `showPointDetails` | 各地の震度観測点を表示 | `bool` | `false` |
| `showTimestamp` | 発生時刻を表示 | `bool` | `true` |
| `showMagnitude` | マグニチュードを表示 | `bool` | `true` |
| `showDepth` | 震源の深さを表示 | `bool` | `true` |
| `showTsunamiStatus` | 国内津波の有無を表示 | `bool` | `true` |

### スタイル設定

| オプション | 説明 | 型 | デフォルト |
|---|---|---|---|
| `compactMode` | コンパクト（1行）表示 | `bool` | `false` |
| `colorizeByScale` | 震度に応じた色分け | `bool` | `true` |
| `blinkOnEEW` | 緊急地震速報受信時に点滅 | `bool` | `true` |
| `showIcon` | 震度バッジアイコンを表示 | `bool` | `true` |

### 通知モード設定（`displayMode: "notification"` のとき有効）

| オプション | 説明 | 型 | デフォルト |
|---|---|---|---|
| `notificationDuration` | 通知を表示し続ける秒数 | `int` | `300`（5分） |
| `notificationEEWDuration` | EEW の表示秒数（`0` = 上記と同じ） | `int` | `0` |
| `notificationTsunamiDuration` | 津波の表示秒数（`0` = 上記と同じ） | `int` | `0` |
| `notificationMaxItems` | 同時に表示する通知の最大件数 | `int` | `1` |
| `notificationMinScale` | 通知を出す最小震度（`-1` = `minScale` に従う） | `int` | `-1` |
| `notificationFreshness` | この秒数より古い地震は通知しない（`0` = 無効） | `int` | `600`（10分） |
| `notificationBlink` | 表示中に点滅させる | `bool` | `true` |
| `notificationBlinkDuration` | 点滅させる秒数（`0` = 表示中ずっと） | `int` | `30` |
| `notificationCompact` | 1行レイアウト（`top_bar` 向き） | `bool` | `true` |
| `notificationShowCountdown` | 残り時間のプログレスバーを表示 | `bool` | `true` |
| `notifyOnInitialLoad` | 起動時に取得した過去の地震も通知する | `bool` | `false` |

> `notificationFreshness` により、MagicMirror を再起動しても数時間前の地震で
> 通知が出ることはありません。また `notifyOnInitialLoad: false` のため、
> 起動直後の一括取得分は通知されません。

### 全画面アラート設定

`list` / `notification` どちらのモードでも動作します。

| オプション | 説明 | 型 | デフォルト |
|---|---|---|---|
| `fullscreenAlert` | 全画面アラートを有効化 | `bool` | `false` |
| `fullscreenMinSeverity` | 全画面にする最小重大度（1〜3） | `int` | `3` |
| `fullscreenMinScale` | 地震の場合の最小震度 | `int` | `45`（震度5弱） |
| `fullscreenDuration` | 表示秒数（`0` = 通知の期限まで） | `int` | `30` |
| `fullscreenOnEEW` | EEW（警報）は常に全画面 | `bool` | `true` |
| `fullscreenOnTsunamiWarning` | 津波警報・大津波警報は常に全画面 | `bool` | `true` |
| `fullscreenBlink` | 背景を脈動させる | `bool` | `true` |
| `fullscreenDimBackground` | 背後の画面を暗くする | `bool` | `true` |

#### 重大度（severity）の判定

| 重大度 | 条件 | 配色 |
|---|---|---|
| `1` | 震度5弱未満の地震 / 津波予報の解除 | 青（情報） |
| `2` | 震度5弱・5強 / 津波注意報 | 橙（注意） |
| `3` | 震度6弱以上 / EEW（警報） / 津波警報・大津波警報 | 赤（警戒） |

### テストモード設定

| オプション | 説明 | 型 | デフォルト |
|---|---|---|---|
| `testMode` | テストモードを有効化（**本番では `false`**） | `bool` | `false` |
| `testHotkeys` | `Ctrl+Shift+<キー>` でシナリオを発火 | `bool` | `true` |
| `testAutoRun` | シナリオを自動で巡回実行 | `bool` | `false` |
| `testAutoRunInterval` | 自動実行の間隔（秒） | `int` | `20` |
| `testShowBadge` | 「TEST MODE」表示を出す | `bool` | `true` |
| `testScenarioOnStart` | 起動後に一度だけ実行するシナリオ名 | `string` | `null` |
| `testStartDelay` | 上記を実行するまでの待ち時間（秒） | `int` | `3` |

### データソース設定

| オプション | 説明 | 型 | デフォルト |
|---|---|---|---|
| `useWebSocket` | WebSocket でリアルタイム受信 | `bool` | `true` |
| `useRESTFallback` | REST API をフォールバック利用 | `bool` | `true` |
| `restUpdateInterval` | REST ポーリング間隔（秒） | `int` | `300`（5分） |
| `wsEndpoint` | WebSocket エンドポイント | `string` | `wss://api.p2pquake.net/v2/ws` |
| `restEndpoint` | REST API エンドポイント | `string` | `https://api.p2pquake.net/v2` |

### 震度（`minScale`）の値

| 値 | 震度 |
|---|---|
| `-1` | すべて表示 |
| `10` | 震度1 |
| `20` | 震度2 |
| `30` | 震度3 |
| `40` | 震度4 |
| `45` | 震度5弱 |
| `50` | 震度5強 |
| `55` | 震度6弱 |
| `60` | 震度6強 |
| `70` | 震度7 |

## 技術的な特徴

### WebSocket 自動再接続

[reconnecting-websocket](https://github.com/joewalnes/reconnecting-websocket) を使用し、接続断時に自動再接続を行います。

- 初回再接続: 1〜4秒（ランダム）
- 最大再接続間隔: 60秒
- 再接続遅延の成長係数: 1.5倍
- 再試行回数: 無制限

### データフロー

```
P2P地震情報 API (WebSocket) ──→ node_helper.js ──→ MMM-EarthquakeMonitorJP.js
         │                           │                         │
         │  wss://api.p2pquake.net   │  Socket通知             │  DOM更新
         │                           │                         │
P2P地震情報 API (REST) ────────→ (フォールバック)            ブラウザ
```

### 重複排除

- WebSocket と REST API の両方から同一情報が届く可能性があるため、`id` フィールドによる重複排除を実装
- 最大1000件の ID を保持し、メモリリークを防止
- REST ポーリングは初回のみ一括送信し、2回目以降は**新規イベントのみ**を配信するため、
  ポーリングごとに同じ地震で通知が再発火することはありません

## 動作確認（テストモード）

実際の地震を待たずに表示を検証できます。

```js
config: {
  displayMode: "notification",
  fullscreenAlert: true,
  testMode: true,        // ← 有効化（本番では false に戻してください）
  testShowBadge: true,   // 「TEST MODE」表示でテストデータだと分かるようにする
}
```

テストモードで生成されるデータには `【テスト】` および `TEST DATA` の
マーカーが付くため、本物の地震情報と誤認する心配はありません。

### 1. ホットキー（`testHotkeys: true`）

MagicMirror の画面上で `Ctrl + Shift + <キー>` を押します。

| キー | シナリオ |
|---|---|
| `Ctrl+Shift+1` | 震度2 千葉県北西部 |
| `Ctrl+Shift+2` | 震度3 宮古島近海 |
| `Ctrl+Shift+3` | 震度4 茨城県沖 |
| `Ctrl+Shift+4` | 震度5強 石川県能登地方 |
| `Ctrl+Shift+5` | 震度6強 熊本県熊本地方 |
| `Ctrl+Shift+6` | 震度7 宮城県沖 |
| `Ctrl+Shift+0` | 古い地震（30分前・通知されないことの確認） |
| `Ctrl+Shift+E` | 緊急地震速報（警報） |
| `Ctrl+Shift+C` | 緊急地震速報 取消 |
| `Ctrl+Shift+T` | 津波注意報 |
| `Ctrl+Shift+M` | 大津波警報 |
| `Ctrl+Shift+X` | 津波予報 解除 |
| `Ctrl+Shift+Q` | すべてクリア |

### 2. ブラウザコンソール

MagicMirror を `npm start dev` で起動し、DevTools のコンソールから実行します。

```js
MMMEarthquakeTest.list()        // 利用可能なシナリオ一覧
MMMEarthquakeTest.run("quake7") // 震度7 を発火
MMMEarthquakeTest.clear()       // すべてクリア
```

### 3. 他モジュールからの連携

MMM-Buttons / MMM-Remote-Control などから通知を送って発火できます。

```js
this.sendNotification("EARTHQUAKE_TEST", "quake7");
this.sendNotification("EARTHQUAKE_TEST_CLEAR");
this.sendNotification("EARTHQUAKE_DISMISS_FULLSCREEN"); // testMode 不要
```

> `EARTHQUAKE_TEST` / `EARTHQUAKE_TEST_CLEAR` は `testMode: true` のときのみ
> 受け付けます。本番設定では無視されるため安全です。

### 4. MagicMirror なしで確認する（開発者向け）

MagicMirror をインストールせずに、実際のモジュールファイルを検証できます。

```bash
# ヘッドレスの自動テスト（125項目）
npm run verify

# ブラウザプレビュー（http://localhost:8080）
npm run preview
```

`npm run preview` は小さな MagicMirror シムの上で実際の
`MMM-EarthquakeMonitorJP.js` / `.css` を読み込み、各シナリオを
ボタンで発火できるプレビューページを提供します。
`http://localhost:8080/preview/browser-check.html` を開くと、
実ブラウザでのレイアウト・CSS アニメーションの自動チェック（41項目）が走ります。

## 依存関係

- [reconnecting-websocket](https://www.npmjs.com/package/reconnecting-websocket) — WebSocket 自動再接続
- [ws](https://www.npmjs.com/package/ws) — Node.js WebSocket 実装

## P2P地震情報 API について

本モジュールは [P2P地震情報](https://www.p2pquake.net/) が提供する JSON API v2 / WebSocket API を利用しています。

- 商用・非商用問わず無償で利用可能
- API キー不要
- 詳細: [JSON API v2 仕様書](https://www.p2pquake.net/develop/json_api_v2/)
- 二次利用規定: [二次利用できます · P2P地震情報](https://www.p2pquake.net/secondary_use/)

### レート制限

- `/history`: 60 リクエスト/分（IP アドレス毎）
- WebSocket: 制限なし（推奨接続方式）

## 開発用サンドボックス

P2P地震情報 API にはテスト用のサンドボックスが用意されています。
開発・動作確認時に便利です。

```js
config: {
  wsEndpoint: "wss://api-realtime-sandbox.p2pquake.net/v2/ws",
  restEndpoint: "https://api-v2-sandbox.p2pquake.net/v2",
}
```

> **注意:** サンドボックスの WebSocket は10分で強制切断されます。同時接続数にも制限があります。

## トラブルシューティング

### 地震情報が表示されない

1. MagicMirror のログを確認: `npm start dev`
2. WebSocket 接続状態を確認
3. REST API への接続を確認: `curl https://api.p2pquake.net/v2/history?codes=551&limit=5`
4. `minScale` が高すぎないか確認

### WebSocket が頻繁に切断される

- ネットワーク環境を確認
- ファイアウォールで WSS (443) が許可されているか確認
- `reconnecting-websocket` が自動で再接続を行うため、一時的な切断は正常動作

### 表示が崩れる

- 日本語フォント（Noto Sans JP 等）がインストールされているか確認
- `position` 設定が MagicMirror の有効な位置であるか確認

### 通知モードなのに平常時に何か表示される

- `header` を設定していないか確認してください。MagicMirror はモジュール本体が
  非表示でもヘッダーを描画するため、通知モードでは `header` を外してください
- `testShowBadge` が `true` かつ `testMode: true` の場合、「TEST MODE」表示が
  残ります。本番では `testMode: false` にしてください

### 通知が表示されない

1. `minScale` / `notificationMinScale` が高すぎないか確認
2. `notificationFreshness`（デフォルト10分）より古い地震は通知されません
3. 起動直後の一括取得分は通知されません（`notifyOnInitialLoad: true` で変更可）
4. `testMode: true` にしてホットキーで表示自体を確認

### 全画面アラートが出ない

1. `fullscreenAlert: true` になっているか確認（デフォルトは `false`）
2. 地震の場合は `fullscreenMinScale`（デフォルト震度5弱）以上か確認
3. 津波注意報は既定では全画面になりません（警報以上が対象）
4. `Ctrl+Shift+6`（震度7）で動作確認

## ライセンス

MIT License — [LICENSE](LICENSE) を参照

## 謝辞

- [P2P地震情報](https://www.p2pquake.net/) — 地震情報 API の提供
- [MagicMirror²](https://magicmirror.builders/) — スマートミラープラットフォーム
- [MMM-EarthquakeAlerts](https://github.com/dathbe/MMM-EarthquakeAlerts) — コンセプトの参考
