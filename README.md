# 公平猜拳 (fair-rps)

多人公平猜拳 web app：Fastify + Socket.IO 後端、React + Vite 前端（npm workspaces：`shared`、`server`、`web`）。

## 本機啟動

需要 Node 22.12 以上。

    npm install
    npm run dev        # 開發模式
    npm run build && npm start   # 正式模式，預設 http://localhost:3000

未設定 `HOST_TOKEN` 時會隨機產生，並在 console 印出裁判網址。

## 部署到 Render

1. Render 後台 New > Blueprint，選此 repo（讀取 `render.yaml`）。
2. 在服務的 Environment 填入 `HOST_TOKEN`（裁判密鑰，至少 16 字元的隨機字串，勿放進 repo）。
3. 部署完成後，裁判網址為 `https://<服務網址>/?host=<HOST_TOKEN>`（參數名稱以程式內 `HOST_QUERY_PARAM` 為準）。

## 環境變數

| 名稱 | 說明 |
|---|---|
| `HOST_TOKEN` | 裁判密鑰，必填（Render 上 `sync: false`） |
| `TRUST_PROXY` | 在代理後面請設 `1`（`render.yaml` 已設） |
| `PORT` | Render 自動提供 |
| `NODE_ENV` | `production` |
| `MAX_CONNECTIONS_PER_IP`／`MAX_PLAYERS_PER_IP` | 選填，每 IP 上限 |
