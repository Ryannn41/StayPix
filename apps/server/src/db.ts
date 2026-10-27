import Database from "better-sqlite3";
import type { ImageAsset, Tag } from "@staypix/shared";

interface ImageRow {
  id: number;
  original_name: string;
  stored_name: string;
  mime_type: string;
  size: number;
  width: number | null;
  height: number | null;
  uploaded_at: string;
}

interface TagRow {
  id: number;
  name: string;
  is_system: number;
}

export interface NewImage {
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
}

export interface StoredImage extends ImageAsset {
  storedName: string;
}

export function createDatabase(filename: string) {
  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      is_system INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS image_tags (
      image_id INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (image_id, tag_id)
    );
    CREATE INDEX IF NOT EXISTS idx_image_tags_tag ON image_tags(tag_id);
  `);

  const tagColumns = db.pragma("table_info(tags)") as Array<{ name: string }>;
  if (!tagColumns.some((column) => column.name === "is_system")) {
    db.exec("ALTER TABLE tags ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0");
  }
  const seedSystemTag = db.prepare(`
    INSERT INTO tags (name, is_system) VALUES (?, 1)
    ON CONFLICT(name) DO UPDATE SET is_system = 1
  `);
  for (const name of ["客房", "餐饮", "带人物", "lifestyle", "酒店外观图"]) {
    seedSystemTag.run(name);
  }

  const tagsForImage = db.prepare(`
    SELECT tags.id, tags.name, tags.is_system
    FROM tags
    JOIN image_tags ON image_tags.tag_id = tags.id
    WHERE image_tags.image_id = ?
    ORDER BY tags.name COLLATE NOCASE
  `);

  function toTag(row: TagRow): Tag {
    return { id: row.id, name: row.name, isSystem: Boolean(row.is_system) };
  }

  function toImage(row: ImageRow): StoredImage {
    return {
      id: row.id,
      originalName: row.original_name,
      storedName: row.stored_name,
      mimeType: row.mime_type,
      size: row.size,
      width: row.width,
      height: row.height,
      uploadedAt: row.uploaded_at,
      tags: (tagsForImage.all(row.id) as TagRow[]).map(toTag),
      previewUrl: `/api/images/${row.id}/preview`,
      downloadUrl: `/api/images/${row.id}/download`,
    };
  }

  function normalizeTags(names: string[]) {
    return [...new Set(names.map((name) => name.trim()).filter(Boolean))].slice(0, 30);
  }

  const ensureTag = db.prepare(`
    INSERT INTO tags (name) VALUES (?)
    ON CONFLICT(name) DO UPDATE SET name = excluded.name
    RETURNING id
  `);
  const attachTag = db.prepare(
    "INSERT OR IGNORE INTO image_tags (image_id, tag_id) VALUES (?, ?)",
  );

  const insertImage = db.prepare(`
    INSERT INTO images (original_name, stored_name, mime_type, size, width, height)
    VALUES (@originalName, @storedName, @mimeType, @size, @width, @height)
  `);

  const addImageTransaction = db.transaction((image: NewImage, tagNames: string[]) => {
    const result = insertImage.run(image);
    const imageId = Number(result.lastInsertRowid);
    for (const name of normalizeTags(tagNames)) {
      const tag = ensureTag.get(name) as { id: number };
      attachTag.run(imageId, tag.id);
    }
    return imageId;
  });

  const updateTagsTransaction = db.transaction((imageId: number, tagNames: string[]) => {
    db.prepare("DELETE FROM image_tags WHERE image_id = ?").run(imageId);
    for (const name of normalizeTags(tagNames)) {
      const tag = ensureTag.get(name) as { id: number };
      attachTag.run(imageId, tag.id);
    }
  });

  return {
    close: () => db.close(),

    listTags: () =>
      (
        db
          .prepare("SELECT id, name, is_system FROM tags ORDER BY is_system DESC, name COLLATE NOCASE")
          .all() as TagRow[]
      ).map(toTag),

    deleteTag(id: number) {
      const tag = db.prepare("SELECT id, name, is_system FROM tags WHERE id = ?").get(id) as
        | TagRow
        | undefined;
      if (!tag) return "not_found" as const;
      if (tag.is_system) return "system" as const;
      db.prepare("DELETE FROM tags WHERE id = ?").run(id);
      return "deleted" as const;
    },

    listImages(tagIds: number[] = []) {
      let rows: ImageRow[];
      if (tagIds.length) {
        const placeholders = tagIds.map(() => "?").join(",");
        rows = db
          .prepare(`
            SELECT images.*
            FROM images
            JOIN image_tags ON image_tags.image_id = images.id
            WHERE image_tags.tag_id IN (${placeholders})
            GROUP BY images.id
            HAVING COUNT(DISTINCT image_tags.tag_id) = ?
            ORDER BY images.uploaded_at DESC, images.id DESC
          `)
          .all(...tagIds, tagIds.length) as ImageRow[];
      } else {
        rows = db
          .prepare("SELECT * FROM images ORDER BY uploaded_at DESC, id DESC")
          .all() as ImageRow[];
      }
      return rows.map(toImage);
    },

    getImage(id: number) {
      const row = db.prepare("SELECT * FROM images WHERE id = ?").get(id) as
        | ImageRow
        | undefined;
      return row ? toImage(row) : undefined;
    },

    deleteImage(id: number) {
      return db.prepare("DELETE FROM images WHERE id = ?").run(id).changes > 0;
    },

    addImage(image: NewImage, tagNames: string[]) {
      const id = addImageTransaction(image, tagNames);
      return this.getImage(id)!;
    },

    updateImageTags(id: number, tagNames: string[]) {
      const exists = db.prepare("SELECT 1 FROM images WHERE id = ?").get(id);
      if (!exists) return undefined;
      updateTagsTransaction(id, tagNames);
      return this.getImage(id)!;
    },
  };
}

export type StayPixDatabase = ReturnType<typeof createDatabase>;
