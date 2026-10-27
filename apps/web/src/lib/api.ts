import type {
  ApiError,
  ImageAsset,
  ImageListResponse,
  TagListResponse,
  UploadResponse,
} from "@staypix/shared";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    let message = "请求失败，请稍后重试";
    try {
      message = ((await response.json()) as ApiError).message || message;
    } catch {
      // 保留默认错误信息
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function assetUrl(path: string) {
  return `${API_BASE}${path}`;
}

export async function listImages(tagIds: number[] = []) {
  const query = tagIds.length ? `?tags=${tagIds.join(",")}` : "";
  return (await request<ImageListResponse>(`/api/images${query}`)).images;
}

export async function listTags() {
  return (await request<TagListResponse>("/api/tags")).tags;
}

export async function deleteTag(id: number) {
  await request<void>(`/api/tags/${id}`, { method: "DELETE" });
}

export async function uploadImages(files: File[], tags: string[]) {
  const form = new FormData();
  files.forEach((file) => form.append("images", file));
  form.append("tags", JSON.stringify(tags));
  return (await request<UploadResponse>("/api/images", { method: "POST", body: form })).images;
}

export async function updateImageTags(id: number, tags: string[]): Promise<ImageAsset> {
  const result = await request<{ image: ImageAsset }>(`/api/images/${id}/tags`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags }),
  });
  return result.image;
}
