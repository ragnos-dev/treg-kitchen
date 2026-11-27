import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import recipeHandler from '../api/recipe.js';

const publicDir = resolve('public');
const mime = {
  '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.md': 'text/plain', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/api/recipe') {
      if (req.method === 'POST') {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 8192) {
            res.writeHead(413).end();
            return;
          }
          chunks.push(chunk);
        }
        try { req.body = JSON.parse(Buffer.concat(chunks)); }
        catch { res.writeHead(400).end(JSON.stringify({ error: 'Submit a JSON use case.' })); return; }
      }
      res.status = (status) => { res.statusCode = status; return res; };
      res.json = (body) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
      return await recipeHandler(req, res);
    }
    const file = resolve(publicDir, '.' + decodeURIComponent(path === '/' ? '/index.html' : path));
    if (!file.startsWith(publicDir + sep)) return res.writeHead(404).end();
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': `${mime[extname(file)] || 'application/octet-stream'}; charset=utf-8` });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch {
    res.writeHead(404).end();
  }
}).listen(Number(process.env.PORT || 4173), '127.0.0.1', () => {
  console.log(`treg-kitchen is at http://127.0.0.1:${process.env.PORT || 4173}`);
});
