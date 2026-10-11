import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url)), records = [], seen = new Set(), active = new Set();
function canonical(from, path) { const full = resolve(root, dirname(from), path); if (!full.startsWith(root))
    throw new Error('Module outside project'); return relative(root, full).split(sep).join('/'); }
async function visit(path) {
    if (seen.has(path))
        return;
    if (active.has(path))
        throw new Error(`Bundler expects an acyclic static graph: ${path}`);
    active.add(path);
    let source = await readFile(resolve(root, path), 'utf8');
    const dependencies = [];
    source = source.replace(/((?:\bfrom\s*|\bimport\s*)["'])(\.{1,2}\/[^"']+)(["'])/g, (_m, a, s, b) => { const target = canonical(path, s); dependencies.push(target); return `${a}@lab/${target}${b}`; });
    source = source.replace(/new URL\(['"](\.{1,2}\/[^'"]+)['"],\s*import\.meta\.url\)/g, (_m, s) => { const target = canonical(path, s); dependencies.push(target); return `new URL("@lab/${target}")`; });
    for (const dependency of dependencies)
        await visit(dependency);
    active.delete(path);
    seen.add(path);
    records.push({ path, source });
}
await visit('apps/studio/app.js');
let html = await readFile(resolve(root, 'apps/studio/index.html'), 'utf8'), css = await readFile(resolve(root, 'apps/studio/styles.css'), 'utf8');
const serialized = JSON.stringify(records).replace(/<\/script/gi, '<\\/script');
const loader = `<script>\n(()=>{const records=${serialized};const urls=Object.create(null);for(const record of records){const code=record.source.replace(/(["'])@lab\\/([^"']+)\\1/g,(_m,q,path)=>{if(!urls[path])throw new Error('Missing bundled module '+path);return q+urls[path]+q;});urls[record.path]=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));}import(urls['apps/studio/app.js']).catch(error=>{console.error(error);document.getElementById('status-message').textContent='Application initialization failed: '+error.message;});})();\n</script>`;
html = html.replace('<link rel="stylesheet" href="./styles.css">', () => `<style>${css}</style>`).replace('<script type="module" src="./app.js"></script>', () => loader);
const licenses = {
    license: await readFile(resolve(root, 'LICENSE'), 'utf8'),
    thirdParty: await readFile(resolve(root, 'THIRD_PARTY_NOTICES.md'), 'utf8')
};
const notices = '<script type="application/json" id="license-notices">' + JSON.stringify(licenses).replace(/<\/script/gi, '<\\/script') + '</script>';
html = html.replace('</body>', () => notices + '</body>');
const target = process.argv[2] ?? resolve(root, 'Sketchpad-Lab.html');
await writeFile(target, html);
console.log(`Standalone ${target}: ${records.length} modules, ${Buffer.byteLength(html).toLocaleString()} bytes. No external runtime dependencies.`);
