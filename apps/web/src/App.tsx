import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  Search,
  Tag as TagIcon,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { ImageAsset, Tag } from "@staypix/shared";
import {
  assetUrl,
  deleteTag,
  listImages,
  listTags,
  updateImageTags,
  uploadImages,
} from "./lib/api";

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

interface TagPickerProps {
  tags: Tag[];
  selected: string[];
  onChange: (names: string[]) => void;
  allowCreate?: boolean;
}

function TagPicker({ tags, selected, onChange, allowCreate = false }: TagPickerProps) {
  const [draft, setDraft] = useState("");
  const normalized = new Set(selected.map((name) => name.toLocaleLowerCase()));

  function toggle(name: string) {
    const exists = normalized.has(name.toLocaleLowerCase());
    onChange(exists ? selected.filter((item) => item.toLocaleLowerCase() !== name.toLocaleLowerCase()) : [...selected, name]);
  }

  function addDraft() {
    const name = draft.trim();
    if (name && !normalized.has(name.toLocaleLowerCase())) onChange([...selected, name]);
    setDraft("");
  }

  return (
    <div className="tag-picker">
      <div className="tag-options">
        {tags.map((tag) => {
          const active = normalized.has(tag.name.toLocaleLowerCase());
          return (
            <button
              className={`tag-option ${active ? "active" : ""}`}
              key={tag.id}
              type="button"
              onClick={() => toggle(tag.name)}
            >
              {active && <Check size={13} />}
              {tag.name}
            </button>
          );
        })}
        {selected
          .filter((name) => !tags.some((tag) => tag.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
          .map((name) => (
            <button className="tag-option active" key={name} type="button" onClick={() => toggle(name)}>
              <Check size={13} />
              {name}
            </button>
          ))}
      </div>
      {allowCreate && (
        <div className="new-tag-row">
          <input
            value={draft}
            maxLength={30}
            placeholder="输入新标签"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addDraft();
              }
            }}
          />
          <button type="button" className="small-button" onClick={addDraft} disabled={!draft.trim()}>
            <Plus size={15} /> 添加
          </button>
        </div>
      )}
    </div>
  );
}

interface UploadDialogProps {
  tags: Tag[];
  onClose: () => void;
  onUploaded: () => Promise<void>;
}

function UploadDialog({ tags, onClose, onUploaded }: UploadDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(incoming: File[]) {
    const images = incoming.filter((file) => file.type.startsWith("image/"));
    setFiles((current) => {
      const keys = new Set(current.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      return [...current, ...images.filter((file) => !keys.has(`${file.name}-${file.size}-${file.lastModified}`))].slice(0, 30);
    });
  }

  async function submit() {
    if (!files.length) return;
    setBusy(true);
    setError("");
    try {
      await uploadImages(files, selectedTags);
      await onUploaded();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "上传失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section className="dialog upload-dialog" role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <div className="dialog-header">
          <div>
            <span className="eyebrow">添加素材</span>
            <h2 id="upload-title">上传酒店照片</h2>
          </div>
          <button className="icon-button" onClick={onClose} disabled={busy} aria-label="关闭">
            <X size={20} />
          </button>
        </div>

        <button
          type="button"
          className={`drop-zone ${dragging ? "dragging" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(Array.from(event.dataTransfer.files));
          }}
        >
          <span className="upload-icon"><Upload size={26} /></span>
          <strong>拖放图片到这里，或点击选择</strong>
          <small>支持 JPG、PNG、WebP、GIF、AVIF · 单张最大 50 MB · 最多 30 张</small>
        </button>
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          multiple
          onChange={(event) => addFiles(Array.from(event.target.files ?? []))}
        />

        {files.length > 0 && (
          <div className="file-summary">
            <div className="section-label">
              <span>已选择 {files.length} 张</span>
              <button type="button" onClick={() => setFiles([])}>全部清除</button>
            </div>
            <div className="file-list">
              {files.map((file, index) => (
                <div className="file-pill" key={`${file.name}-${file.lastModified}`}>
                  <ImageIcon size={15} />
                  <span title={file.name}>{file.name}</span>
                  <small>{formatSize(file.size)}</small>
                  <button type="button" aria-label={`移除 ${file.name}`} onClick={() => setFiles((items) => items.filter((_, i) => i !== index))}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="form-section">
          <div className="section-label"><span>为这批照片添加标签</span><small>可多选</small></div>
          <TagPicker tags={tags} selected={selectedTags} onChange={setSelectedTags} allowCreate />
        </div>

        {error && <p className="error-message">{error}</p>}
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>取消</button>
          <button className="primary-button" type="button" onClick={submit} disabled={!files.length || busy}>
            {busy ? <LoaderCircle className="spin" size={18} /> : <Upload size={18} />}
            {busy ? "正在保存原图…" : `上传 ${files.length || ""} 张照片`}
          </button>
        </div>
      </section>
    </div>
  );
}

interface EditTagsDialogProps {
  image: ImageAsset;
  tags: Tag[];
  onClose: () => void;
  onSaved: (image: ImageAsset) => void;
}

function EditTagsDialog({ image, tags, onClose, onSaved }: EditTagsDialogProps) {
  const [selected, setSelected] = useState(image.tags.map((tag) => tag.name));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      onSaved(await updateImageTags(image.id, selected));
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section className="dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="tags-title">
        <div className="dialog-header">
          <div><span className="eyebrow">整理素材</span><h2 id="tags-title">编辑标签</h2></div>
          <button className="icon-button" onClick={onClose} disabled={busy} aria-label="关闭"><X size={20} /></button>
        </div>
        <div className="editing-file">
          <img src={assetUrl(image.previewUrl)} alt="" />
          <div><strong>{image.originalName}</strong><small>{image.width} × {image.height} · {formatSize(image.size)}</small></div>
        </div>
        <TagPicker tags={tags} selected={selected} onChange={setSelected} allowCreate />
        {error && <p className="error-message">{error}</p>}
        <div className="dialog-actions">
          <button className="secondary-button" onClick={onClose} disabled={busy}>取消</button>
          <button className="primary-button" onClick={save} disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />} 保存标签
          </button>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [editingImage, setEditingImage] = useState<ImageAsset | null>(null);

  async function refresh(tagIds = selectedTagIds) {
    setLoading(true);
    setError("");
    try {
      const [nextImages, nextTags] = await Promise.all([listImages(tagIds), listTags()]);
      setImages(nextImages);
      setTags(nextTags);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "图片库加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh(selectedTagIds);
  }, [selectedTagIds.join(",")]);

  const visibleImages = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return images;
    return images.filter((image) =>
      image.originalName.toLocaleLowerCase().includes(needle)
      || image.tags.some((tag) => tag.name.toLocaleLowerCase().includes(needle)),
    );
  }, [images, search]);

  function toggleFilter(id: number) {
    setSelectedTagIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function removeCustomTag(tag: Tag) {
    if (tag.isSystem || !window.confirm(`确定删除标签“${tag.name}”吗？图片本身不会被删除。`)) return;
    try {
      await deleteTag(tag.id);
      setSelectedTagIds((current) => current.filter((id) => id !== tag.id));
      setTags((current) => current.filter((item) => item.id !== tag.id));
      setImages((current) =>
        current.map((image) => ({
          ...image,
          tags: image.tags.filter((item) => item.id !== tag.id),
        })),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除标签失败");
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="StayPix 首页">
          <span className="brand-mark"><ImageIcon size={21} /></span>
          <span><strong>StayPix</strong><small>酒店图片库</small></span>
        </a>
        <button className="primary-button header-upload" onClick={() => setShowUpload(true)}>
          <Upload size={17} /> 上传照片
        </button>
      </header>

      <main>
        <section className="hero">
          <div>
            <span className="eyebrow">市场部素材中心</span>
            <h1>沉淀影像资产<br /><em>释放素材价值</em></h1>
            <p>集中沉淀酒店影像资源，以标准化标签管理提升素材复用效率。</p>
          </div>
          <div className="hero-stats">
            <div><strong>{images.length}</strong><span>当前照片</span></div>
            <div><strong>{tags.length}</strong><span>素材标签</span></div>
            <div><strong>100%</strong><span>原图保存</span></div>
          </div>
        </section>

        <section className="library">
          <div className="library-heading">
            <div><span className="eyebrow">图片档案</span><h2>全部素材</h2></div>
            <label className="search-box">
              <Search size={18} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索文件名或标签" />
              {search && <button onClick={() => setSearch("")} aria-label="清除搜索"><X size={16} /></button>}
            </label>
          </div>

          <div className="filter-row">
            <span><TagIcon size={15} /> 标签筛选</span>
            <button className={selectedTagIds.length === 0 ? "filter active" : "filter"} onClick={() => setSelectedTagIds([])}>全部</button>
            {tags.map((tag) =>
              tag.isSystem ? (
                <button className={selectedTagIds.includes(tag.id) ? "filter active" : "filter"} key={tag.id} onClick={() => toggleFilter(tag.id)}>
                  {tag.name}
                </button>
              ) : (
                <span className={`filter custom-filter ${selectedTagIds.includes(tag.id) ? "active" : ""}`} key={tag.id}>
                  <button onClick={() => toggleFilter(tag.id)}>{tag.name}</button>
                  <button className="delete-filter" onClick={() => void removeCustomTag(tag)} aria-label={`删除标签 ${tag.name}`} title="删除自定义标签">
                    <Trash2 size={12} />
                  </button>
                </span>
              ),
            )}
          </div>

          {error ? (
            <div className="state-panel error-state"><strong>暂时无法打开图片库</strong><p>{error}</p><button className="secondary-button" onClick={() => void refresh()}>重新加载</button></div>
          ) : loading ? (
            <div className="state-panel"><LoaderCircle className="spin" size={30} /><p>正在整理图片库…</p></div>
          ) : visibleImages.length === 0 ? (
            <div className="state-panel empty-state">
              <span className="empty-icon"><ImageIcon size={30} /></span>
              <strong>{search || selectedTagIds.length ? "没有找到匹配的照片" : "图片库还是空的"}</strong>
              <p>{search || selectedTagIds.length ? "试试调整搜索词或标签筛选。" : "上传第一批酒店照片，开始建立素材库。"}</p>
              {!search && selectedTagIds.length === 0 && <button className="primary-button" onClick={() => setShowUpload(true)}><Upload size={17} /> 上传照片</button>}
            </div>
          ) : (
            <>
              <div className="result-count">显示 {visibleImages.length} 张照片{selectedTagIds.length > 0 && " · 同时包含所有已选标签"}</div>
              <div className="image-grid">
                {visibleImages.map((image) => (
                  <article className="image-card" key={image.id}>
                    <div className="image-frame">
                      <img src={assetUrl(image.previewUrl)} alt={image.originalName} loading="lazy" />
                      <div className="image-actions">
                        <button onClick={() => setEditingImage(image)}><TagIcon size={16} /> 编辑标签</button>
                        <a href={assetUrl(image.downloadUrl)} download><Download size={16} /> 原图</a>
                      </div>
                    </div>
                    <div className="image-info">
                      <strong title={image.originalName}>{image.originalName}</strong>
                      <div className="metadata"><span>{formatDate(image.uploadedAt)}</span><span>{formatSize(image.size)}</span>{image.width && <span>{image.width} × {image.height}</span>}</div>
                      <div className="card-tags">
                        {image.tags.length ? image.tags.map((tag) => <span key={tag.id}>{tag.name}</span>) : <button onClick={() => setEditingImage(image)}>+ 添加标签</button>}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </main>

      <footer><span>StayPix · 酒店市场部图片管理</span><span>原始文件仅保存在本机</span></footer>

      {showUpload && <UploadDialog tags={tags} onClose={() => setShowUpload(false)} onUploaded={() => refresh()} />}
      {editingImage && (
        <EditTagsDialog
          image={editingImage}
          tags={tags}
          onClose={() => setEditingImage(null)}
          onSaved={(updated) => {
            setImages((current) => current.map((image) => image.id === updated.id ? updated : image));
            void listTags().then(setTags);
          }}
        />
      )}
    </div>
  );
}
