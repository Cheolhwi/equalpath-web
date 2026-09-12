import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { api, errorResponse } from "./server/api.mjs";
function localAPI() {
  return {
    name: "equalpath-local-api",
    configureServer(server) {
      server.middlewares.use("/api", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        let text = "";
        try {
          for await (const chunk of req) {
            text += chunk;
            if (text.length > 12000) {
              res.statusCode = 413;
              res.end('{"code":"REQUEST_TOO_LARGE"}');
              return;
            }
          }
          const result = await api(JSON.parse(text));
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify({ ok: true, ...result }));
        } catch (e) {
          const x = errorResponse(e);
          res.statusCode = x.status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(x.body));
        }
      });
    },
  };
}
export default defineConfig({
  plugins: [react(), localAPI()],
  server: {
    host: "127.0.0.1",
    port: 4179,
    watch: {
      ignored: ["**/evidence/**", "**/docs/**", "**/tests/**", "**/.build/**"],
    },
  },
  build: { outDir: "dist" },
  resolve: { preserveSymlinks: false },
});
