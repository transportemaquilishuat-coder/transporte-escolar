const http = require('http');

const data = JSON.stringify({
  email: 'admin.pruebas@transporte.local',
  password: 'Pruebas2026!'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    const fs = require('fs');
    fs.writeFileSync('C:/Users/Daniel/Documents/Proyectos/transporte-backend/login-result.txt', `Status: ${res.statusCode}\nResponse: ${body}`);
  });
});

req.on('error', (e) => {
  const fs = require('fs');
  fs.writeFileSync('C:/Users/Daniel/Documents/Proyectos/transporte-backend/login-result.txt', `Error: ${e.message}`);
});
req.write(data);
req.end();
