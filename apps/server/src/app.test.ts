import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { StayPixDatabase } from "./db.js";

const ORIGINAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

describe("StayPix API", () => {
  let dataDir: string;
  let app: Express;
  let database: StayPixDatabase;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), "staypix-"));
    const created = await createApp({ dataDir, maxFileSizeMb: 5 });
    app = created.app;
    database = created.database;
  });

  afterEach(async () => {
    database.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it("uploads the untouched original and creates multiple tag relations", async () => {
    const response = await request(app)
      .post("/api/images")
      .field("tags", JSON.stringify(["大堂", "精选"]))
      .attach("images", ORIGINAL_PNG, { filename: "酒店大堂.png", contentType: "image/png" })
      .expect(201);

    expect(response.body.images[0]).toMatchObject({
      originalName: "酒店大堂.png",
      mimeType: "image/png",
      size: ORIGINAL_PNG.length,
      width: 1,
      height: 1,
    });
    expect(response.body.images[0].tags.map((tag: { name: string }) => tag.name)).toEqual(["大堂", "精选"]);

    const storedFiles = database.listImages();
    const storedBytes = await readFile(path.join(dataDir, "originals", storedFiles[0].storedName));
    expect(storedBytes.equals(ORIGINAL_PNG)).toBe(true);
  });

  it("filters by all selected tags and updates image tags", async () => {
    const first = await request(app)
      .post("/api/images")
      .field("tags", JSON.stringify(["大堂", "精选"]))
      .attach("images", ORIGINAL_PNG, { filename: "first.png", contentType: "image/png" })
      .expect(201);
    await request(app)
      .post("/api/images")
      .field("tags", JSON.stringify(["大堂"]))
      .attach("images", ORIGINAL_PNG, { filename: "second.png", contentType: "image/png" })
      .expect(201);

    const tags = (await request(app).get("/api/tags").expect(200)).body.tags as Array<{ id: number; name: string }>;
    const lobbyId = tags.find((tag) => tag.name === "大堂")!.id;
    const featuredId = tags.find((tag) => tag.name === "精选")!.id;
    const filtered = await request(app).get(`/api/images?tags=${lobbyId},${featuredId}`).expect(200);
    expect(filtered.body.images.map((image: { originalName: string }) => image.originalName)).toEqual(["first.png"]);

    const id = first.body.images[0].id;
    const updated = await request(app).put(`/api/images/${id}/tags`).send({ tags: ["客房"] }).expect(200);
    expect(updated.body.image.tags).toEqual([expect.objectContaining({ name: "客房" })]);
  });

  it("seeds protected initial tags and only deletes custom tags", async () => {
    await request(app)
      .post("/api/images")
      .field("tags", JSON.stringify(["自定义活动"]))
      .attach("images", ORIGINAL_PNG, { filename: "event.png", contentType: "image/png" })
      .expect(201);

    const tags = (await request(app).get("/api/tags").expect(200)).body.tags as Array<{
      id: number;
      name: string;
      isSystem: boolean;
    }>;
    expect(tags.filter((tag) => tag.isSystem).map((tag) => tag.name)).toEqual(
      expect.arrayContaining(["客房", "餐饮", "带人物", "lifestyle", "酒店外观图"]),
    );
    expect(tags.filter((tag) => tag.isSystem)).toHaveLength(5);

    const systemTag = tags.find((tag) => tag.name === "客房")!;
    await request(app).delete(`/api/tags/${systemTag.id}`).expect(403);

    const customTag = tags.find((tag) => tag.name === "自定义活动")!;
    await request(app).delete(`/api/tags/${customTag.id}`).expect(204);
    const remaining = (await request(app).get("/api/tags").expect(200)).body.tags;
    expect(remaining.some((tag: { name: string }) => tag.name === "自定义活动")).toBe(false);
  });

  it("downloads exactly the original bytes with its original filename", async () => {
    const uploaded = await request(app)
      .post("/api/images")
      .field("tags", "[]")
      .attach("images", ORIGINAL_PNG, { filename: "original-quality.png", contentType: "image/png" })
      .expect(201);
    const id = uploaded.body.images[0].id;

    const downloaded = await request(app).get(`/api/images/${id}/download`).expect(200);
    expect(Buffer.isBuffer(downloaded.body)).toBe(true);
    expect(downloaded.body.equals(ORIGINAL_PNG)).toBe(true);
    expect(downloaded.headers["content-disposition"]).toContain("attachment");
    expect(downloaded.headers["content-type"]).toMatch(/^image\/png/);
  });
});
