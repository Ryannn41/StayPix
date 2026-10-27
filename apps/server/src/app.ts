import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { Request, Response, NextFunction } from "express";
import express from "express";
import cors from "cors";
import multer from "multer";
import { imageSize } from "image-size";
import { createDatabase, type StayPixDatabase } from "./db.js";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

export interface AppOptions {
  dataDir: string;
  maxFileSizeMb?: number;
  db?: StayPixDatabase;
  webDist?: string;
}

function parseTagNames(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error();
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    throw Object.assign(new Error("标签数据格式不正确"), { status: 400 });
  }
}

function decodeUploadFilename(filename: string) {
  const decoded = Buffer.from(filename, "latin1").toString("utf8");
  return decoded.includes("\uFFFD") ? filename : decoded;
}

function parseImageId(value: string | string[] | undefined) {
  const id = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw Object.assign(new Error("图片 ID 无效"), { status: 400 });
  }
  return id;
}

export async function createApp(options: AppOptions) {
  const originalsDir = path.join(options.dataDir, "originals");
  await mkdir(originalsDir, { recursive: true });
  const database = options.db ?? createDatabase(path.join(options.dataDir, "staypix.db"));

  const storage = multer.diskStorage({
    destination: originalsDir,
    filename: (_request, file, callback) => {
      callback(null, `${randomUUID()}${EXTENSIONS[file.mimetype] ?? ""}`);
    },
  });
  const upload = multer({
    storage,
    limits: {
      files: 30,
      fileSize: (options.maxFileSizeMb ?? 50) * 1024 * 1024,
    },
    fileFilter: (_request, file, callback) => {
      if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
        callback(new Error(`不支持的图片格式：${file.originalname}`));
        return;
      }
      callback(null, true);
    },
  });

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/tags", (_request, response) => {
    response.json({ tags: database.listTags() });
  });

  app.delete("/api/tags/:id", (request, response) => {
    const result = database.deleteTag(parseImageId(request.params.id));
    if (result === "not_found") {
      response.status(404).json({ message: "标签不存在" });
      return;
    }
    if (result === "system") {
      response.status(403).json({ message: "初始标签不能删除" });
      return;
    }
    response.status(204).end();
  });

  app.get("/api/images", (request, response) => {
    const rawTagIds = typeof request.query.tags === "string" ? request.query.tags : "";
    const tagIds = rawTagIds
      .split(",")
      .filter(Boolean)
      .map(Number)
      .filter((id) => Number.isSafeInteger(id) && id > 0);
    response.json({ images: database.listImages([...new Set(tagIds)]) });
  });

  app.post(
    "/api/images",
    upload.array("images", 30),
    async (request: Request, response: Response, next: NextFunction) => {
      const files = (request.files as Express.Multer.File[] | undefined) ?? [];
      if (!files.length) {
        response.status(400).json({ message: "请选择至少一张图片" });
        return;
      }

      const committedFiles = new Set<string>();
      try {
        const tagNames = parseTagNames(request.body.tags);
        const images = [];
        for (const file of files) {
          try {
            const dimensions = imageSize(await readFile(file.path));
            if (!dimensions.width || !dimensions.height) throw new Error("无法读取图片尺寸");
            const image = database.addImage(
                {
                  originalName: path.basename(decodeUploadFilename(file.originalname)),
                  storedName: file.filename,
                  mimeType: file.mimetype,
                  size: file.size,
                  width: dimensions.width,
                  height: dimensions.height,
                },
                tagNames,
              );
            images.push(image);
            committedFiles.add(file.path);
          } catch (error) {
            await unlink(file.path).catch(() => undefined);
            throw error;
          }
        }
        response.status(201).json({ images });
      } catch (error) {
        await Promise.all(
          files
            .filter((file) => !committedFiles.has(file.path))
            .map((file) => unlink(file.path).catch(() => undefined)),
        );
        next(error);
      }
    },
  );

  app.put("/api/images/:id/tags", (request, response) => {
    const id = parseImageId(request.params.id);
    const image = database.updateImageTags(id, parseTagNames(request.body.tags));
    if (!image) {
      response.status(404).json({ message: "图片不存在" });
      return;
    }
    response.json({ image });
  });

  function sendImage(disposition: "inline" | "attachment") {
    return (request: Request, response: Response) => {
      const image = database.getImage(parseImageId(request.params.id));
      if (!image) {
        response.status(404).json({ message: "图片不存在" });
        return;
      }
      const filePath = path.join(originalsDir, image.storedName);
      response.type(image.mimeType);
      if (disposition === "attachment") {
        response.download(filePath, image.originalName);
      } else {
        response.sendFile(filePath);
      }
    };
  }

  app.get("/api/images/:id/preview", sendImage("inline"));
  app.get("/api/images/:id/download", sendImage("attachment"));

  if (options.webDist && existsSync(options.webDist)) {
    app.use(express.static(options.webDist));
    app.get(/^\/(?!api(?:\/|$)).*/, (_request, response) => {
      response.sendFile(path.join(options.webDist!, "index.html"));
    });
  }

  app.use(
    (error: Error & { status?: number; code?: string }, _request: Request, response: Response, _next: NextFunction) => {
      const isUploadError = error instanceof multer.MulterError;
      const status = error.status ?? (isUploadError ? 400 : 500);
      let message = status >= 500 ? "服务器处理请求时发生错误" : error.message;
      if (error.code === "LIMIT_FILE_SIZE") message = "图片超过允许的大小";
      if (error.code === "LIMIT_FILE_COUNT") message = "一次最多上传 30 张图片";
      if (!isUploadError && error.message.startsWith("不支持的图片格式")) {
        response.status(400).json({ message: error.message });
        return;
      }
      response.status(status).json({ message });
    },
  );

  return { app, database, originalsDir };
}
