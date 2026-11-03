import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// 镜像只拷 .next/standalone，见 Dockerfile
	output: "standalone",
	// 不装 sharp（pnpm-workspace.yaml 的 allowBuilds）；头像来自 authentik，原样展示即可
	images: { unoptimized: true },
	// 只影响 next dev：它把完整 URL 打进终端，OAuth 回调的 code / state 就在里面。生产不逐请求打日志
	logging: {
		incomingRequests: { ignore: [/^\/api\/auth\//, /^\/api\/healthz/] },
	},
	turbopack: {
		rules: {
			"*.css": {
				loaders: ["@tailwindcss/turbopack"],
				as: "*.css",
			},
		},
	},
};

export default nextConfig;
