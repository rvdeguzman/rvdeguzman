// A gallery of every README animation prototype in this repo's history.
//
// Each commit that touched an SVG becomes a card showing its dark and light
// variants on GitHub's dark and light page colours, at the README's width.
// Uncommitted SVGs in the working tree appear first. Blobs are read straight
// from git, so nothing is checked out or written.
//
//   node --experimental-strip-types scripts/prototypes-server.ts [repo] [host] [port]
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const host = process.argv[3] ?? "127.0.0.1";
const port = Number(process.argv[4] ?? 4321);

type Variant = { path: string; src: string };
type Prototype = { id: string; title: string; when: string; variants: Variant[] };

const git = (...args: string[]) =>
  execFileSync("git", ["-C", root, ...args], { maxBuffer: 256 << 20 });

function prototypes(): Prototype[] {
  const committed: Prototype[] = [];
  const seen = new Set<string>();
  const log = git("log", "--reverse", "--format=%H%x09%h%x09%cI%x09%s", "--", "*.svg")
    .toString().trim().split("\n").filter(Boolean);
  for (const line of log) {
    const [sha, short, date, subject] = line.split("\t");
    const variants: Variant[] = [];
    for (const entry of git("ls-tree", "-r", sha).toString().trim().split("\n")) {
      const [meta, path] = entry.split("\t");
      const blob = meta.split(" ")[2];
      if (!path.endsWith(".svg") || seen.has(blob)) continue;
      seen.add(blob);
      variants.push({ path, src: `/blob/${blob}` });
    }
    if (variants.length) committed.push({ id: short, title: subject, when: date, variants });
  }

  const working: Variant[] = readdirSync(root)
    .filter((f) => f.endsWith(".svg"))
    .filter((f) => !seen.has(git("hash-object", join(root, f)).toString().trim()))
    .map((f) => ({ path: f, src: `/file/${encodeURIComponent(f)}` }));
  const uncommitted = working.length
    ? [{ id: "working tree", title: "Uncommitted changes", when: "now", variants: working }]
    : [];
  return [...uncommitted, ...committed.reverse()];
}

const escape = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function page(list: Prototype[]): string {
  const cards = list.map((p) => `
    <section>
      <header><code>${escape(p.id)}</code> ${escape(p.title)}<time>${escape(p.when)}</time></header>
      <div class="variants">${p.variants.map((v) => `
        <figure class="${v.path.includes("light") ? "light" : "dark"}">
          <a href="${v.src}" target="_blank"><img src="${v.src}" width="320" loading="lazy" alt="${escape(v.path)}"></a>
          <figcaption>${escape(v.path)}</figcaption>
        </figure>`).join("")}
      </div>
    </section>`).join("");
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>README prototypes</title>
<style>
  body { margin: 0; padding: 24px; background: #010409; color: #e6edf3; font: 14px/1.5 -apple-system, system-ui, sans-serif; }
  h1 { font-size: 18px; margin: 0 0 4px; } p { color: #8b949e; margin: 0 0 24px; }
  section { border: 1px solid #30363d; border-radius: 8px; margin-bottom: 24px; overflow: hidden; }
  header { padding: 10px 14px; background: #161b22; border-bottom: 1px solid #30363d; }
  code { color: #79c0ff; margin-right: 6px; } time { float: right; color: #8b949e; }
  .variants { display: flex; flex-wrap: wrap; }
  figure { margin: 0; padding: 16px; flex: 1 1 352px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  figure.dark { background: #0d1117; } figure.light { background: #ffffff; color: #1f2328; }
  img { max-width: 100%; height: auto; display: block; }
  figcaption { font-size: 12px; opacity: .7; }
</style></head><body>
<h1>README prototypes</h1>
<p>${list.length} versions, newest first. Each variant sits on GitHub's matching page colour. Reload to restart the animations.</p>
${cards}
</body></html>`;
}

const svg = { "content-type": "image/svg+xml" };

createServer((req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://x");
    const blob = url.pathname.match(/^\/blob\/([0-9a-f]{40})$/);
    const file = url.pathname.match(/^\/file\/([^/]+\.svg)$/);
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(page(prototypes()));
    } else if (blob) {
      res.writeHead(200, { ...svg, "cache-control": "public, max-age=31536000, immutable" });
      res.end(git("cat-file", "blob", blob[1]));
    } else if (file && !decodeURIComponent(file[1]).includes("/")) {
      res.writeHead(200, { ...svg, "cache-control": "no-store" });
      res.end(readFileSync(join(root, decodeURIComponent(file[1]))));
    } else {
      res.writeHead(404).end("not found");
    }
  } catch (err) {
    res.writeHead(500).end(String(err));
  }
}).listen(port, host, () => console.log(`README prototypes on http://${host}:${port}`));
