import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

/**
 * 只打一次性入口（迁移、cron）；web 进程由 `next build` 的 standalone 产物负责。
 *
 * 依赖全部打进 bundle：镜像里只有 standalone 按 web 进程追踪出来的 node_modules，不保证有这些
 * 入口用到的包。⚠️ 格式是 cjs：pg / pino 是 CommonJS，打进 ESM bundle 后运行时
 * `Dynamic require of "events" is not supported`。
 */
export default defineConfig({
	entry: {
		"bin/migrate": "src/bin/migrate.ts",
	},
	format: ["cjs"],
	platform: "node",
	target: "node24",
	outDir: "dist",
	clean: true,
	sourcemap: true,
	noExternal: [/.*/],
	// pg 只在对应运行时才 require 它们：pg-native（libpq 绑定）、pg-cloudflare（workerd）
	external: ["pg-native", "pg-cloudflare"],
	esbuildOptions(options) {
		// server-only 的默认导出条件是 throw，只有 react-server 条件下是空模块；bin 不是 RSC
		options.alias = {
			...options.alias,
			"server-only": fileURLToPath(
				new URL("./node_modules/server-only/empty.js", import.meta.url),
			),
		};
	},
});
