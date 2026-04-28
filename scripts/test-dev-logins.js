require('dotenv').config({ quiet: true });

const http = require('http');

const PORT = Number(process.env.PORT || 3000);
const PASSWORD = process.env.DEV_USERS_PASSWORD || 'Pruebas2026!';

const accounts = [
    'superadmin.pruebas@transporte.local',
    'admin.pruebas@transporte.local',
    'conductor.pruebas@transporte.local',
    'padre.pruebas@transporte.local',
];

const login = (email) =>
    new Promise((resolve) => {
        const data = JSON.stringify({ email, password: PASSWORD });
        const req = http.request(
            {
                hostname: 'localhost',
                port: PORT,
                path: '/api/auth/login',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                },
            },
            (res) => {
                let body = '';
                res.on('data', (chunk) => {
                    body += chunk;
                });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(body);
                        resolve({
                            email,
                            status: res.statusCode,
                            ok: res.statusCode >= 200 && res.statusCode < 300,
                            rol: parsed.usuario?.rol,
                            error: parsed.error,
                        });
                    } catch (error) {
                        resolve({ email, status: res.statusCode, ok: false, error: body });
                    }
                });
            }
        );

        req.on('error', (error) => {
            resolve({ email, ok: false, error: error.message });
        });

        req.write(data);
        req.end();
    });

(async () => {
    const results = [];
    for (const email of accounts) {
        results.push(await login(email));
    }
    console.table(results);
})();
