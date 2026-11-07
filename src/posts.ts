import { getCollection } from 'astro:content';

// 已发布文章 +（仅本地预览时）草稿，按日期新到旧排序
export async function getPosts() {
	const published = (await getCollection('blog')).map((p) => ({ ...p, isDraft: false }));
	const drafts = import.meta.env.DEV
		? (await getCollection('drafts')).map((p) => ({ ...p, isDraft: true }))
		: [];
	return [...published, ...drafts].sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export type Post = Awaited<ReturnType<typeof getPosts>>[number];
