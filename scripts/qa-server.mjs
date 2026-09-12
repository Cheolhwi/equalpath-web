// Local-only failure harness. It serves a separate build and never reaches Appwrite.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createAPI, errorResponse } from "../server/api.mjs";
const root = resolve(import.meta.dirname, "../.qa-dist"),
  api = createAPI({
    store: {
      catalog: async () => {
        throw Error("No live data in this test harness");
      },
    },
  });
let searches = 0;
const port = Number(process.env.QA_PORT || 4180);
createServer(async (req, res) => {
  try {
    if (req.url === "/api" && req.method === "POST") {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 12000) {
          res.writeHead(413);
          res.end();
          return;
        }
      }
      const body = JSON.parse(raw);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      if (body.action === "search" && ++searches === 2) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        res.writeHead(503);
        res.end(JSON.stringify({ ok: false, code: "SERVICE_UNAVAILABLE" }));
        return;
      }
      const out = await api(body);
      res.end(JSON.stringify({ ok: true, ...out }));
      return;
    }
    const url = new URL(req.url, "http://127.0.0.1"),
      file = resolve(
        root,
        "." +
          decodeURIComponent(
            url.pathname === "/" ? "/index.html" : url.pathname,
          ),
      );
    if (!file.startsWith(root + "/")) {
      res.writeHead(404);
      res.end();
      return;
    }
    const mime = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".woff2": "font/woff2",
      ".svg": "image/svg+xml",
    };
    res.setHeader(
      "Content-Type",
      mime[extname(file)] ?? "application/octet-stream",
    );
    const bytes = await readFile(file);
    res.end(process.env.QA_FAIL_MAP === '1' && extname(file) === '.js'
      ? bytes.toString().replaceAll('https://tiles.openfreemap.org/planet', `http://127.0.0.1:${port}/qa-missing-tilejson`)
      : bytes);
  } catch (e) {
    const out = errorResponse(e);
    res.writeHead(out.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(out.body));
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Local failure harness: http://127.0.0.1:${port}/?mode=demo`),
);
