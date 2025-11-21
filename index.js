const http = require('http');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const { program } = require('commander');
const formidable = require('formidable');

// --- 1. Налаштування Commander.js ---
program
  .option('-h, --host <host>', 'адреса сервера', 'localhost')
  .option('-p, --port <port>', 'порт сервера', 3000)
  .option('-c, --cache <dir>', 'шлях до директорії кешу', 'cache')
  .parse(process.argv);

const options = program.opts();
const HOST = options.host;
const PORT = options.port;
const CACHE_DIR = path.resolve(process.cwd(), options.cache);
const INVENTORY_FILE = path.join(CACHE_DIR, 'inventory.json');

// --- 2. Ініціалізація сховища даних ---
let inventory = [];

if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function loadInventory() {
    if (fs.existsSync(INVENTORY_FILE)) {
        try {
            const data = fs.readFileSync(INVENTORY_FILE, 'utf8');
            inventory = JSON.parse(data);
        } catch (e) {
            console.error("Помилка читання inventory.json:", e.message);
        }
    }
}
loadInventory();

function saveInventory() {
    fs.writeFileSync(INVENTORY_FILE, JSON.stringify(inventory, null, 2), 'utf8');
}

// --- 3. Основний обробник HTTP запитів (Routing Logic) ---
const server = http.createServer((req, res) => {
  const url = req.url;
  const method = req.method;

  // A. Обслуговування статичних форм
  if (method === 'GET' && (url === '/RegisterForm.html' || url === '/SearchForm.html')) {
      serveStaticFile(path.join(__dirname, 'public', url), res);
      return;
  }

  // B. Обробка POST /register
  if (url === '/register' && method === 'POST') {
      handleRegister(req, res);
      return;
  }

  // C. Обробка всіх маршрутів, що починаються з /inventory
  if (url.startsWith('/inventory')) {
      handleInventoryRoutes(req, res);
      return;
  }
  
  // D. Обробка POST /search
  if (url === '/search' && method === 'POST') {
      handleSearch(req, res);
      return;
  }

  // E. Обробка 404 Not Found (за замовчуванням)
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
});

// --- 4. Запуск сервера ---
server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}/`);
});

// --- 5. Допоміжні функції (будуть додані нижче) ---

function serveStaticFile(filePath, res) { /* ... */ }
function handleRegister(req, res) { /* ... */ }
function handleInventoryRoutes(req, res) { /* ... */ }
function handleSearch(req, res) { /* ... */ }
function parseJsonBody(req) { /* ... */ }
function handleMethodNotAllowed(req, res, allowedMethods) { /* ... */ }