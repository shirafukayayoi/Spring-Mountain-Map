# Spring Mountain Map

3D地形ビュー + 2D地図 + GPXレース表示を行う、単一HTMLベースのデモです。

## セットアップ

```powershell
cd "C:\Users\ron06\Documents\Program\Spring-Mountain-Map"
python -m http.server 8000
```

ブラウザで `http://localhost:8000` を開いてください。

## 主な機能

- 既定GPXの自動読込
- テンプレートGPXの切替（左上のプルダウン）
- 任意GPXの手動アップロード
- 3Dルート表示 / 2D地図同期表示
- レース表示（複数ランナー、順位、速度表示、カメラモード）

## 同梱GPX

### 1) 実際にダウンロードして使用しているGPX

- `data/koruldi-lakes.gpx`
  - 配布元ページ: [Realworld Adventures GPS Tracks](https://realworldadventures.com/gps-tracks/)
  - 対象記事: [Hiking Koruldi Lakes, Georgia](https://realworldadventures.com/hike-koruldi-lakes-loop-georgia/)
  - ダウンロードリンク（ZIP）: [koruldi_kakes.gpx_.zip](https://realworldadventures.com/wp-content/uploads/2025/10/koruldi_kakes.gpx_.zip)

### 2) 海外テンプレートとして同梱した簡易GPX（デモ用）

以下はUI切替や表示検証のためにプロジェクト内で用意したテンプレートです。

- `data/chamonix-valley-template.gpx`（France）
- `data/machu-picchu-template.gpx`（Peru）
- `data/uluru-area-template.gpx`（Australia）

## 注意

- `file://` 直開きだと `fetch` 制約で既定GPXが読めない場合があります。ローカルサーバー経由で実行してください。
- 外部GPXの利用条件は配布元サイトの規約に従ってください。
