# StayPix

酒店市场部内部使用的小型图片管理平台。支持批量上传原图、为图片添加多个标签、按标签组合筛选，以及无压缩下载原始文件。

## 本地运行

项目使用名为 `fullstack` 的 Conda 环境，Node.js 与 npm 已安装在该环境内。

```bash
conda activate fullstack
npm install
cp .env.example .env
npm run dev
```

浏览器打开 <http://127.0.0.1:5173>。开发模式下，Vite 会把 `/api` 请求转发到本地 Express 服务（端口 `3001`）。

## 生产构建

```bash
conda activate fullstack
npm run build
npm run start -w @staypix/server
```

构建后访问 <http://127.0.0.1:3001>，Express 会同时提供 API 和前端静态文件。

## 阿里云一键部署

服务器已有 Conda 时，克隆仓库后直接运行：

```bash
git clone <仓库地址> StayPix
cd StayPix
./deploy.sh
```

脚本只会创建或更新 `fullstack` Conda 环境、安装锁定版本依赖并执行生产构建，不会安装或启动 tmux。默认端口为 `3001`，自定义端口可使用：

```bash
STAYPIX_PORT=8080 ./deploy.sh
```

重新运行脚本会重新安装依赖和构建，但不会删除 `data/` 中的数据库和原图。准备完成后，自行在 tmux 中启动：

```bash
tmux new -s staypix
conda activate fullstack
npm run start -w @staypix/server
```

按 `Ctrl+B`，再按 `D` 可退出 tmux 而不停止服务。最后还需要在阿里云安全组中放行对应 TCP 端口。

## 数据保存与备份

- SQLite 数据库：`data/staypix.db`
- 原始图片：`data/originals/`
- 图片上传后不会压缩、缩放或转码；下载接口直接读取该目录中的原始字节。
- 备份时请同时复制数据库文件和整个 `data/originals/` 目录，二者需要配套恢复。
- 运行产生的数据已被 Git 忽略，不会误提交到仓库。

可在根目录 `.env` 中调整本机监听地址、端口、数据目录和单文件大小限制，配置示例见 `.env.example`。本项目没有用户及权限系统，默认只监听 `127.0.0.1`，适合本机 Demo；如需部署到局域网，应先补充访问控制。

## 常用命令

```bash
npm run dev        # 同时启动前端和服务端
npm run typecheck  # 全项目 TypeScript 检查
npm test           # 服务端 API 测试
npm run build      # 生产构建
```

## 目录结构

```text
apps/web/          React + Vite 前端
apps/server/       Express + SQLite 本地服务
packages/shared/   前后端共享的 TypeScript 类型
data/              本地数据库和原图（不进入 Git）
```
