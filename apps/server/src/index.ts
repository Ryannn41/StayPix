import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createApp } from "./app.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dataDir = path.resolve(projectRoot, process.env.DATA_DIR ?? "data");
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3001);
const maxFileSizeMb = Number(process.env.MAX_FILE_SIZE_MB ?? 50);

const { app, database } = await createApp({
  dataDir,
  maxFileSizeMb,
  webDist: path.join(projectRoot, "apps/web/dist"),
});
const server = app.listen(port, host, () => {
  console.log(`StayPix 服务已启动：http://${host}:${port}`);
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
