import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../server.js";

const apiRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(apiRoot, "..");

export default createApp({
  database: process.env.MONEYFY_DB || "/tmp/virtudoc.sqlite",
  uploadDir: process.env.MONEYFY_UPLOAD_DIR || "/tmp/virtudoc-uploads",
  staticRoot: projectRoot
});

