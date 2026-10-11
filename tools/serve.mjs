import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url))), port = Number(process.env.PORT ?? 4173);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.md': 'text/plain', '.tx2as': 'text/plain' };
http.createServer(async (req, res) => { try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname), file = resolve(root, '.' + (path === '/' ? '/apps/studio/index.html' : path));
    if (file !== root && !file.startsWith(root + sep)) {
        res.writeHead(403).end();
        return;
    }
    const s = await stat(file);
    if (!s.isFile()) {
        res.writeHead(404).end();
        return;
    }
    res.writeHead(200, { 'Content-Type': (types[extname(file)] ?? 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(await readFile(file));
}
catch {
    res.writeHead(404).end('Not found');
} }).listen(port, '0.0.0.0', () => console.log(`Sketchpad Lab: http://localhost:${port}`));
