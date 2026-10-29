/**
 * Servidor de Telemetria e Monitoramento em Tempo Real
 * 100% nativo em Node.js (não necessita npm install)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'dados_coletados.json');

// Inicializa o arquivo de dados se não existir
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf-8');
}

// Lê os dados salvos
function readStoredData() {
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        return JSON.parse(raw);
    } catch (e) {
        return [];
    }
}

// Salva os dados
function saveStoredData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
        return true;
    } catch (e) {
        console.error('Erro ao salvar no arquivo:', e);
        return false;
    }
}

// Detecta IP local da máquina na rede Wi-Fi/Ethernet
function getLocalNetworkIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    // Configuração CORS para permitir requisições de qualquer origem
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    // Rota API: GET /api/data (Retorna histórico)
    if (pathname === '/api/data' && req.method === 'GET') {
        const data = readStoredData();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        return;
    }

    // Rota API: POST /api/collect (Recebe nova coleta)
    if (pathname === '/api/collect' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
            // Proteção contra payload excessivo (> 10MB)
            if (body.length > 10 * 1024 * 1024) {
                req.socket.destroy();
            }
        });

        req.on('end', () => {
            try {
                const packet = JSON.parse(body);
                const currentData = readStoredData();
                currentData.unshift(packet);

                // Mantém até 200 registros mais recentes
                const trimmedData = currentData.slice(0, 200);
                saveStoredData(trimmedData);

                const hasPhoto = packet.camera && packet.camera.photo ? 'com Foto' : 'sem Foto';
                const hasGps = packet.location ? `GPS: ${packet.location.latitude.toFixed(4)}, ${packet.location.longitude.toFixed(4)}` : 'sem GPS';

                console.log(`[+] Nova coleta recebida | ID: ${packet.id} | ${hasGps} | ${hasPhoto}`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, id: packet.id, total: trimmedData.length }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'JSON inválido' }));
            }
        });
        return;
    }

    // Rota API: DELETE /api/data (Limpa dados)
    if (pathname === '/api/data' && req.method === 'DELETE') {
        saveStoredData([]);
        console.log('[-] Banco de coletas foi limpo.');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Dados apagados' }));
        return;
    }

    // Rota Raiz: redireciona para painel.html
    let filePath = pathname === '/' ? '/painel.html' : pathname;
    const safePath = path.normalize(path.join(__dirname, filePath));

    // Proteção básica contra path traversal
    if (!safePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Acesso proibido');
        return;
    }

    fs.stat(safePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Página ou arquivo não encontrado.');
            return;
        }

        const ext = path.extname(safePath).toLowerCase();
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        const stream = fs.createReadStream(safePath);
        stream.pipe(res);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    const localIp = getLocalNetworkIp();
    console.clear();
    console.log('================================================================');
    console.log('       SISTEMA DE TELEMETRIA, GPS & CAMERA INICIADO             ');
    console.log('================================================================');
    console.log(`💻 Painel no Computador:    http://localhost:${PORT}/painel.html`);
    console.log(`📱 Coletor no Celular:      http://${localIp}:${PORT}/coletor.html`);
    console.log(`📡 Endpoint de API:         http://localhost:${PORT}/api/collect`);
    console.log('----------------------------------------------------------------');
    console.log('Dica: Abra o link do celular no seu smartphone conectado na mesma');
    console.log('rede Wi-Fi para disparar coletas remotas em tempo real!');
    console.log('================================================================\n');
});

