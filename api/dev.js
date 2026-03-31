/**
 * Development Server Entry Point
 * Features: Hot reload support, verbose logging, devtools
 */
import dotenv from "dotenv";
import { createApp } from "./config.js";
import log from "../utils/color-logger.js";
import fs from "fs";
import path from "path";
import { marked } from "marked";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 10000;
const { app, cleanupOldZips } = createApp();

// Development middleware
app.use((req, res, next) => {
    // eslint-disable-next-line no-console
    // console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    log(`[${new Date().toISOString()}]`, "gray", req.method, "cyan", req.path, "blue");
    next();
});

// Run cleanup on startup
cleanupOldZips();

// Schedule cleanup every hour
setInterval(cleanupOldZips, 60 * 60 * 1000);

// Dev tools: Error page middleware (shows stack traces in development)
app.use((err, req, res, _next) => {
    console.error("[Development Error]", err);
    res.status(err.status || 500).json({
        status: err.status || 500,
        error: err.message,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined
    });
});

// Beautified Docs index route: lists all .md files in docs/ with preview, links to /md/:file
app.get("/docs", async (req, res) => {
    const docsDir = path.join(__dirname, "..", "docs");
    try {
        const files = await fs.promises.readdir(docsDir);
        const mdFiles = files.filter(f => f.endsWith(".md"));
        // Read first heading or first 2 lines as preview
        const previews = await Promise.all(mdFiles.map(async (f) => {
            const filePath = path.join(docsDir, f);
            try {
                const content = await fs.promises.readFile(filePath, "utf8");
                const lines = content.split(/\r?\n/);
                let title = lines.find(l => l.startsWith("# ")) || f;
                let desc = lines.find(l => l && !l.startsWith("#")) || "No description.";
                return { f, title: title.replace(/^# /, ""), desc };
            } catch {
                return { f, title: f, desc: "Could not read file." };
            }
        }));
        const links = previews.map(({ f, title, desc }) =>
            `<li class='mb-6 p-4 border rounded-lg bg-white/80 shadow'><a href="/md/${encodeURIComponent(f)}" class='text-xl font-bold text-blue-700 underline'>${title}</a><p class='text-gray-700 mt-1 mb-0 text-base'>${desc}</p></li>`
        ).join("");
        res.send(`<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'><title>Documentation Index</title><link rel='stylesheet' href='/css/output.css'></head><body class='bg-slate-50 text-slate-800 antialiased min-h-screen'><header class='py-8'><div class='max-w-3xl mx-auto px-4'><h1 class='text-3xl font-extrabold text-slate-900'>Documentation</h1><p class='mt-2 text-slate-600'>Quick access to project docs and guides.</p></div></header><main class='max-w-3xl mx-auto px-4 pb-12'><ul class='space-y-4'>${links}</ul></main></body></html>`);
    } catch (err) {
        res.status(500).send("Could not list documentation files.");
    }
});

app.get("/md/:file", async (req, res) => {
    const fileName = req.params.file;
    if (!/^[\w-]+\.md$/.test(fileName)) {
        return res.status(400).send("Invalid file name");
    }
    const filePath = path.join(__dirname, "..", "docs", fileName);
    try {
        const md = await fs.promises.readFile(filePath, "utf8");
        const html = marked.parse(md);
                res.send(`<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'><title>${fileName.replace(/\.md$/, "")} | Docs</title><link rel='stylesheet' href='/css/output.css'><link rel='stylesheet' href='/static/docs-overrides.css'></head><body class='bg-slate-50 text-slate-800 antialiased min-h-screen'><div class='max-w-3xl mx-auto px-4 py-8'><nav class='mb-6'><a href='/docs' class='text-sky-600 hover:text-sky-700 underline'>&larr; Back to Docs Index</a></nav><article class='prose prose-slate lg:prose-xl bg-white rounded-2xl shadow p-8'>${html}</article></div>
<script>
document.addEventListener('DOMContentLoaded', function(){
    const tocLinks = document.querySelectorAll('.toc a');
    if(!tocLinks.length) return;
    const article = document.querySelector('article.prose');
    if(!article) return;
    const headings = article.querySelectorAll('h1,h2,h3,h4,h5');
    function normalize(s){ return (s||'').replace(/^[^a-z0-9]+/i,'').replace(/\s+/g,' ').trim().toLowerCase(); }
    tocLinks.forEach(a => {
        // strip emoji or leading glyphs from link text
        const clean = a.textContent.replace(/[\u2600-\u26FF\u2700-\u27BF\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}]/gu, '').trim();
        const text = normalize(clean);
        let match = Array.from(headings).find(h => normalize(h.textContent).startsWith(text) || normalize(h.textContent).includes(text));
        if(match){
            // ensure heading has id
            if(!match.id){
                const id = normalize(match.textContent).replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
                match.id = id || 'section-'+Math.random().toString(36).slice(2,8);
            }
            a.href = '#'+match.id;
            a.addEventListener('click', function(e){
                e.preventDefault();
                match.scrollIntoView({behavior:'smooth', block:'start'});
                try{ history.replaceState(null,'', '#'+match.id); } catch(e){}
            });
        }
    });
    // Floating back-to-top button
    (function(){
        const btn = document.createElement('button');
        btn.className = 'doc-top-btn';
        btn.title = 'Back to top';
        btn.innerHTML = '▲';
        document.body.appendChild(btn);
        const showAt = 300;
        function update(){
            if(window.scrollY > showAt) btn.style.display = 'block'; else btn.style.display = 'none';
        }
        window.addEventListener('scroll', update);
        btn.addEventListener('click', function(){ window.scrollTo({ top: 0, behavior: 'smooth' }); });
        update();
    })();
});
</script>
</body></html>`);
    } catch (err) {
        res.status(404).send("Markdown file not found");
    }
});

app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    log("╔══════════════════════════════════════════╗", "blue");
    log("║      ", "blue", "VN-Sutra Development Server", "cyan", "       ║", "blue");
    log("╠══════════════════════════════════════════╣", "blue");
    log("║   ", "blue", "PORT:   ", "gray", PORT.toString().padEnd(28), "blue", "║", "blue");
    log("║   ", "blue", "MODE:   ", "yellow", "DEVELOPMENT".padEnd(28), "blue", "║", "blue");
    log("║   ", "blue", "URL:    ", "green", `http://localhost:${PORT}`.padEnd(28), "blue", "║", "blue");
    log("║   ", "blue", "Hot:    ", "magenta", "ws://localhost:3001".padEnd(28), "blue", "║", "blue");
    log("║   ", "blue", "Docs:   ", "cyan", `http://localhost:${PORT}/docs`.padEnd(28), "blue", "║", "blue");
    log("╚══════════════════════════════════════════╝", "blue");
});
