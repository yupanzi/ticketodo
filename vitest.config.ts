import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 测试默认 silent（pino 直写 fd，会和报告搅在一起）。必须在 loadEnvFile 之前：它不覆盖已有变量
process.env.LOG_LEVEL ??= "silent";

// ⚠️ 不能删：vitest 不读 .env，而集成测试无 TEST_DATABASE_URL 时静默跳过。CI 没有该文件，吞掉 ENOENT
try {
	process.loadEnvFile(fileURLToPath(new URL("./.env", import.meta.url)));
} catch {}

// ⚠️ 集成测试只准碰测试库：被测代码读的是 DATABASE_URL（getDb），这里换成 TEST_DATABASE_URL；
// 没配测试库就清掉 DATABASE_URL，免得 .env 里的开发库被测试改写
if (process.env.TEST_DATABASE_URL) {
	process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
	delete process.env.DATABASE_URL;
}

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
	resolve: {
		// Vite 不读 tsconfig 的 paths
		alias: [
			{ find: /^~\//, replacement: `${src}/` },
			// server-only 的默认导出条件是 throw；测试不是 RSC 环境
			{
				find: /^server-only$/,
				replacement: fileURLToPath(
					new URL("./node_modules/server-only/empty.js", import.meta.url),
				),
			},
		],
	},
	test: {
		include: ["src/**/*.test.ts"],
		globalSetup: ["src/test/global-setup.ts"],
		environment: "node",
		// ⚠️ 集成测试共用一个库：并行跑会互相看到对方灌的数据（审计只追加、删不掉）
		fileParallelism: false,
	},
});
