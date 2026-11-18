import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HOST_QUERY_PARAM } from "@fair-rps/shared";
import { createApp } from "./app.js";
import { ConfigError, loadConfig, startupNotes, type ServerConfig } from "./config.js";

const webDist = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");

let config: ServerConfig;
try {
  config = loadConfig(process.env);
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(`無法啟動：${error.message}`);
  process.exit(1);
}

const app = await createApp({
  hostToken: config.hostToken,
  webDist,
  logger: true,
  trustProxy: config.trustProxy,
  limits: { maxConnectionsPerIp: config.maxConnectionsPerIp, maxPlayersPerIp: config.maxPlayersPerIp },
});

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen(config.port);

if (config.hostTokenGenerated) {
  const path = `/?${HOST_QUERY_PARAM}=${config.hostToken}`;
  console.log(`未設定 HOST_TOKEN，已隨機產生。裁判網址：http://localhost:${config.port}${path}`);
  console.log(`經由反向代理或 tunnel 時，請在對外網址後接上 ${path}`);
}
for (const note of startupNotes(config)) console.log(note);
