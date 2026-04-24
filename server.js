const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');
const INDEX_FILE = path.join(DIST_DIR, 'index.html');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};

function sendFile(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.createReadStream(filePath)
        .on('error', () => {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Error interno del servidor');
        })
        .once('open', () => {
            res.writeHead(200, { 'Content-Type': contentType });
        })
        .pipe(res);
}

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url || '/');
    const pathname = decodeURIComponent(parsedUrl.pathname || '/');
    const requestedPath = path.normalize(path.join(DIST_DIR, pathname));

    if (!requestedPath.startsWith(DIST_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
    }

    if (pathname === '/' || pathname === '') {
        sendFile(res, INDEX_FILE);
        return;
    }

    fs.stat(requestedPath, (err, stats) => {
        if (!err && stats.isFile()) {
            sendFile(res, requestedPath);
            return;
        }

        fs.stat(INDEX_FILE, (indexErr) => {
            if (indexErr) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('La build web no existe. Ejecuta `npm run web` primero.');
                return;
            }

            sendFile(res, INDEX_FILE);
        });
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Frontend web sirviendo en puerto ${PORT}`);
});
