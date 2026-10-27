export interface Tag {
  id: number;
  name: string;
  isSystem: boolean;
}

export interface ImageAsset {
  id: number;
  originalName: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  uploadedAt: string;
  tags: Tag[];
  previewUrl: string;
  downloadUrl: string;
}

export interface ImageListResponse {
  images: ImageAsset[];
}

export interface TagListResponse {
  tags: Tag[];
}

export interface UploadResponse {
  images: ImageAsset[];
}

export interface ApiError {
  message: string;
}
