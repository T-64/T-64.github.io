import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const schema = z.object({
	title: z.string(),
	description: z.string(),
	pubDate: z.coerce.date(),
	updatedDate: z.coerce.date().optional(),
});

// 已发布：src/content/blog/（进 Git，公开）
const blog = defineCollection({
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	schema,
});

// 草稿：src/content/drafts/（被 .gitignore 排除，永远不会推上 GitHub，只在本地预览出现）
const drafts = defineCollection({
	loader: glob({ base: './src/content/drafts', pattern: '**/*.{md,mdx}' }),
	schema,
});

export const collections = { blog, drafts };
