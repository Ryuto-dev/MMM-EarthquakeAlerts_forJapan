# MMM-EarthquakeMonitorJP

[MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror) 用の日本向け地震情報モジュールです。
[P2P地震情報 API](https://www.p2pquake.net/) の WebSocket / REST API を使用し、リアルタイムで地震・津波・緊急地震速報を表示します。

## 主な機能

- **リアルタイム地震情報** — WebSocket 接続で低遅延のデータ受信
- **緊急地震速報（EEW）** — 警報レベルの緊急地震速報を点滅表示
- **津波予報** — 大津波警報・津波警報・津波注意報をカラーで表示
- **震度バッジ** — 気象庁準拠のカラーで震度を視覚的に表示
- **自動再接続** — WebSocket 切断時に自動で再接続（reconnecting-websocket 使用）
- **REST API フォールバック** — WebSocket 不通時でも定期ポーリングで情報取得
- **重複排除** — 同一情報の二重表示を防止

## スクリーンショット

### 地震情報表示

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

## 設定オプション一覧

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

## ライセンス

MIT License — [LICENSE](LICENSE) を参照

## 謝辞

- [P2P地震情報](https://www.p2pquake.net/) — 地震情報 API の提供
- [MagicMirror²](https://magicmirror.builders/) — スマートミラープラットフォーム
- [MMM-EarthquakeAlerts](https://github.com/dathbe/MMM-EarthquakeAlerts) — コンセプトの参考
