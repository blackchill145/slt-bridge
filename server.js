const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// In-Memory Session Store
const sessions = {};

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.task': 'application/octet-stream',
  '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
  // 1. Handle Real-Time Session Sync APIs
  if (req.url.startsWith('/api/session')) {
    // Enable CORS for API routes
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        let data = {};
        try {
          data = JSON.parse(body || '{}');
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
          return;
        }

        // Endpoint: Create Session (Signer)
        if (req.url === '/api/session/create') {
          const name = data.name || 'Anonymous Signer';
          const sessionId = 'SLT-' + Math.floor(1000 + Math.random() * 9000);
          
          sessions[sessionId] = {
            id: sessionId,
            signerName: name,
            currentText: '',
            viewers: [],
            lastUpdate: Date.now()
          };
          
          console.log(`[Session] Created "${sessionId}" for signer "${name}"`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, sessionId }));
          return;
        }

        // Endpoint: Join Session (Viewer)
        if (req.url === '/api/session/join') {
          const id = (data.sessionId || '').toUpperCase().trim();
          const name = data.name || 'Anonymous Viewer';
          
          if (!sessions[id]) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Session code not found' }));
            return;
          }
          
          if (!sessions[id].viewers.includes(name)) {
            sessions[id].viewers.push(name);
          }
          
          console.log(`[Session] Viewer "${name}" joined "${id}"`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, signerName: sessions[id].signerName }));
          return;
        }

        // Endpoint: Update Translation Text (Signer Pushes Updates)
        if (req.url === '/api/session/update') {
          const id = (data.sessionId || '').toUpperCase().trim();
          const text = data.text || '';
          
          if (!sessions[id]) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Session not found' }));
            return;
          }
          
          sessions[id].currentText = text;
          sessions[id].lastUpdate = Date.now();
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'API Endpoint not found' }));
      });
      return;
    }

    // Endpoint: Get Session Status (Viewer Polls Status)
    if (req.method === 'GET' && req.url.startsWith('/api/session/status')) {
      const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const id = (urlObj.searchParams.get('id') || '').toUpperCase().trim();
      
      if (!sessions[id]) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Session not found' }));
        return;
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        signerName: sessions[id].signerName,
        currentText: sessions[id].currentText,
        viewers: sessions[id].viewers
      }));
      return;
    }
  }

  // 2. Handle Static Files serving
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = filePath.split('?')[0];

  const fullPath = path.join(__dirname, filePath);

  // Security check: ensure path is within directory
  if (!fullPath.startsWith(__dirname)) {
    res.statusCode = 403;
    res.end('Access Denied');
    return;
  }

  fs.stat(fullPath, (err, stats) => {
    if (err || !stats.isFile()) {
      // For Single Page App, fall back to index.html if file not found
      // and request does not have an extension (navigation)
      const ext = path.extname(filePath);
      if (!ext) {
        const indexPath = path.join(__dirname, 'index.html');
        fs.readFile(indexPath, (indexErr, content) => {
          if (indexErr) {
            res.statusCode = 500;
            res.end('Server Error: index.html not found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content, 'utf-8');
          }
        });
      } else {
        res.statusCode = 404;
        res.end(`File not found: ${filePath}`);
      }
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(fullPath, (readErr, content) => {
      if (readErr) {
        res.statusCode = 500;
        res.end(`Server Error: Could not read file ${filePath}`);
      } else {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*'
        });
        res.end(content, 'utf-8');
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`  SLT Bridge Server is running!`);
  console.log(`  Local URL:  http://localhost:${PORT}`);
  console.log(`==================================================`);
  console.log(`Press Ctrl+C to stop.`);
});
