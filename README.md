# t-64.github.io

Zhaoqing Tan 的个人主页与博客。Astro 静态站，push 到 `main` 后由 GitHub Actions 自动部署。

## 改主页

- 简介文字：`src/copy/intro.md`（纯 Markdown）
- 链接（Email / GitHub / LinkedIn / CV）和落款：`src/consts.ts`（留空字符串就不显示）

## 写文章

1. 在 `src/content/drafts/` 新建 `my-post.md`。这个文件夹被 `.gitignore` 排除，**永远不会推到 GitHub**：

   ```md
   ---
   title: "标题"
   description: "一句话简介（搜索结果和分享卡片里显示）"
   pubDate: 2026-11-08
   ---

   正文……
   ```

2. 本地预览（只有本地能看到草稿，会标 `draft`）：

   ```bash
   nvm use && npm run dev
   ```

   打开 http://localhost:4321

3. 发布：把文件从 `src/content/drafts/` 移到 `src/content/blog/`，然后

   ```bash
   git add -A && git commit -m "Post: 标题" && git push
   ```

   一两分钟后上线。网址是 `/blog/<文件名>/`。

## 注意

- 进了 `src/content/blog/` 并 push 的内容会留在公开的 Git 历史里，之后删除文件也无法从历史中抹掉。没定稿的东西只放 `drafts/`。
- 需要 Node ≥ 22.23（`.nvmrc` 指定 24）。
