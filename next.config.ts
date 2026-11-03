import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// 镜像只拷 .next/standalone，见 Dockerfile
	output: "standalone",
	// 不装 sharp（pnpm-workspace.yaml 的 allowBuilds）；头像来自 authentik，原样展示即可
	images: { unoptimized: true },
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
