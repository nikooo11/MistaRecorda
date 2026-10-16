import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import electron from "vite-plugin-electron/simple";

function electronMainCjsOutputPlugin(): Plugin {
	return {
		name: "recordly-electron-main-cjs-output",
		enforce: "post",
		config(config) {
			// Vite mergeConfig concatenates lib.formats with the plugin's ESM default.
			config.build ??= {};
			const build = config.build;
			const lib = build.lib;
			if (lib && typeof lib === "object") {
				lib.formats = ["cjs"];
				lib.fileName = (_format, entryName) => `${entryName}.cjs`;
			}

			build.rollupOptions ??= {};
			const rollupOptions = build.rollupOptions;
			const cjsOutput = {
				format: "cjs" as const,
				inlineDynamicImports: true,
				entryFileNames: "[name].cjs",
				chunkFileNames: "[name]-[hash].cjs",
			};

			rollupOptions.output = Array.isArray(rollupOptions.output)
				? rollupOptions.output.map((output) => ({ ...output, ...cjsOutput }))
				: { ...(rollupOptions.output ?? {}), ...cjsOutput };
		},
	};
}

function electronMainCjsGuardPlugin(): Plugin {
	return {
		name: "recordly-electron-main-cjs-guard",
		closeBundle() {
			const scriptPath = path.resolve(__dirname, "scripts/smoke-electron-main-cjs.mjs");
			const result = spawnSync(process.execPath, [scriptPath], {
				cwd: __dirname,
				encoding: "utf8",
			});

			if (result.status !== 0) {
				const details = [result.stdout, result.stderr].filter(Boolean).join("\n");
				throw new Error(
					`Electron main CJS smoke failed after Vite build.${details ? `\n${details}` : ""}`,
				);
			}
		},
	};
}

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		{
			name: "local-pdf-assets",
			configureServer(server) {
				server.middlewares.use("/pdfjs/", (req, res, next) => {
					const root = path.resolve(__dirname, "node_modules/pdfjs-dist");
					const relative = (req.url?.split("?")[0] ?? "").replace(/^\//, "");
					if (!/^(cmaps|standard_fonts|wasm)\/[a-zA-Z0-9_.-]+$/.test(relative))
						return next();
					const target = path.join(root, relative);
					if (!fs.existsSync(target)) return next();
					res.setHeader(
						"Content-Type",
						target.endsWith(".wasm")
							? "application/wasm"
							: target.endsWith(".js")
								? "text/javascript"
								: "application/octet-stream",
					);
					fs.createReadStream(target).pipe(res);
				});
			},
			closeBundle() {
				for (const dir of ["cmaps", "standard_fonts", "wasm"])
					fs.cpSync(
						path.resolve(__dirname, "node_modules/pdfjs-dist", dir),
						path.resolve(__dirname, "dist/pdfjs", dir),
						{ recursive: true },
					);
			},
		},
		{
			name: "local-excalidraw-fonts",
			configureServer(server) {
				server.middlewares.use("/excalidraw/", (req, res, next) => {
					const root = path.resolve(
						__dirname,
						"node_modules/@excalidraw/excalidraw/dist/prod",
					);
					const target = path.resolve(root, `.${req.url?.split("?")[0] || "/"}`);
					if (
						!target.startsWith(root + path.sep) ||
						!fs.existsSync(target) ||
						!fs.statSync(target).isFile()
					)
						return next();
					res.setHeader(
						"Content-Type",
						target.endsWith(".woff2") ? "font/woff2" : "application/octet-stream",
					);
					fs.createReadStream(target).pipe(res);
				});
			},
			closeBundle() {
				fs.cpSync(
					path.resolve(__dirname, "node_modules/@excalidraw/excalidraw/dist/prod/fonts"),
					path.resolve(__dirname, "dist/excalidraw/fonts"),
					{ recursive: true },
				);
			},
		},
		react(),
		electron({
			main: {
				// Shortcut of `build.lib.entry`.
				entry: "electron/main.ts",
				vite: {
					build: {
						lib: {
							entry: "electron/main.ts",
							formats: ["cjs"],
							fileName: (_format, entryName) => `${entryName}.cjs`,
						},
						rollupOptions: {
							external: ["ffmpeg-static", "uiohook-napi", "ws"],
							output: {
								format: "cjs",
								inlineDynamicImports: true,
								entryFileNames: "[name].cjs",
								chunkFileNames: "[name]-[hash].cjs",
							},
						},
					},
					plugins: [electronMainCjsOutputPlugin(), electronMainCjsGuardPlugin()],
				},
			},
			preload: {
				// Shortcut of `build.rollupOptions.input`.
				// Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
				input: path.join(__dirname, "electron/preload.ts"),
			},
			// Polyfill the Electron and Node.js API for the renderer process.
			// If you want to use Node.js in the renderer process, enable `nodeIntegration` in the main process.
			// See https://github.com/electron-vite/vite-plugin-electron-renderer
			renderer:
				process.env.NODE_ENV === "test"
					? // https://github.com/electron-vite/vite-plugin-electron-renderer/issues/78#issuecomment-2053600808
						undefined
					: {},
		}),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
	optimizeDeps: {
		entries: ["index.html"],
		exclude: [
			"react-icons/bs",
			"react-icons/fa",
			"react-icons/fa6",
			"react-icons/fi",
			"react-icons/md",
			"react-icons/rx",
		],
	},
	build: {
		target: "esnext",
		minify: "terser",
		terserOptions: {
			compress: {
				drop_console: true,
				drop_debugger: true,
				pure_funcs: ["console.log", "console.debug"],
			},
		},
		rollupOptions: {
			input: {
				main: path.resolve(__dirname, "index.html"),
				tablet: path.resolve(__dirname, "tablet.html"),
			},
			output: {
				manualChunks: {
					pixi: ["pixi.js"],
					"react-vendor": ["react", "react-dom"],
					"video-processing": ["mediabunny", "mp4box", "@fix-webm-duration/fix"],
				},
			},
		},
		chunkSizeWarningLimit: 1000,
	},
});
