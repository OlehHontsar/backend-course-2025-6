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

    // --- A, B, C, D: Всі ваші існуючі маршрути залишаються тут ---

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
        handleInventoryRoutes(req, res); // Ця функція сама обробляє 405 для своїх URL
        return;
    }
    // D. Обробка POST /search
    if (url === '/search' && method === 'POST') {
        handleSearch(req, res);
        return;
    }

    // --- E. Обробка 404 та 405 (кінцева логіка) ---
    
    // Перевіряємо, чи є запитуваний URL відомим базовим маршрутом
    const knownBaseUrls = ['/register', '/inventory', '/search', '/RegisterForm.html', '/SearchForm.html'];
    
    // Витягуємо базову частину URL (наприклад, з /inventory/123/photo отримуємо /inventory)
    const requestBaseUrl = '/' + req.url.split('/').filter(part => part.length > 0)[0];

    if (knownBaseUrls.includes(requestBaseUrl)) {
        // Ми знаємо цей URL, але метод (наприклад, PUT для /search) не підтримується основним обробником
        handleMethodNotAllowed(req, res, []); // Точний список дозволених методів повинен визначатися всередині обробників A, B, C, D
    } else {
        // Невідомий URL
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
    }
});

// --- 4. Запуск сервера ---
server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}/`);
});

// --- 5. Допоміжні функції (будуть додані нижче) ---

function serveStaticFile(filePath, res) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end("File not found");
        } else {
            const contentType = filePath.endsWith('.html') ? 'text/html' : 'text/plain';
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        }
    });
}
/**
 * @file Основний файл сервера, що реалізує Web API для інвентаризації.
 * @author Ваше Ім'я bc2025-6
 */

/**
 * Обробляє POST /register запити.
 * @param {http.IncomingMessage} req - Об'єкт запиту.
 * @param {http.ServerResponse} res - Об'єкт відповіді.
 */
function handleRegister(req, res) {
    const form = formidable({ uploadDir: CACHE_DIR, keepExtensions: true });

    form.parse(req, (err, fields, files) => {
        if (err) { res.writeHead(500); res.end('Server Error'); return; }

        // Commander fields/files normalization
        const name = Array.isArray(fields.inventory_name) ? fields.inventory_name[0] : fields.inventory_name;
        const description = Array.isArray(fields.description) ? fields.description[0] : fields.description;
        const photoFile = files.photo ? (Array.isArray(files.photo) ? files.photo[0] : files.photo) : null;

        if (!name) { // 400 Bad Request
            if (photoFile && fs.existsSync(photoFile.filepath)) fs.unlinkSync(photoFile.filepath);
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Error: inventory_name is required.');
            return;
        }

        const id = Date.now().toString(); 
        let photoPath = null;

        if (photoFile) {
            const fileExt = path.extname(photoFile.originalFilename);
            photoPath = path.join(CACHE_DIR, `${id}${fileExt}`);
            fs.renameSync(photoFile.filepath, photoPath);
        }

        const newItem = {
            id: id,
            inventory_name: name,
            description: description || '',
            photoPath: photoPath,
            photoUrl: photoPath ? `/inventory/${id}/photo` : null
        };

        inventory.push(newItem);
        saveInventory();

        res.writeHead(201, { 'Content-Type': 'application/json' }); // 201 Created
        res.end(JSON.stringify(newItem));
    });
}
function handleInventoryRoutes(req, res) {
    const urlParts = req.url.split('/').filter(part => part.length > 0);
    // urlParts = ['inventory', 'ID', 'photo']

    if (req.method === 'GET') {
        if (urlParts.length === 1 && urlParts[0] === 'inventory') {
            // GET /inventory (Список усіх речей)
            res.writeHead(200, { 'Content-Type': 'application/json' });
            const publicInventory = inventory.map(item => ({
                id: item.id,
                inventory_name: item.inventory_name,
                description: item.description,
                photoUrl: item.photoUrl
            }));
            res.end(JSON.stringify(publicInventory));
            return;
        } 
        
        if (urlParts[0] === 'inventory' && urlParts.length >= 2) {
            const id = urlParts[1];
            const item = inventory.find(i => i.id === id);

            if (!item) { // 404 Not Found: Річ не існує
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Item not found');
                return;
            }

            if (urlParts[2] === 'photo' && urlParts.length === 3) {
                // GET /inventory/<ID>/photo
                if (!item.photoPath || !fs.existsSync(item.photoPath)) { // 404 Not Found: Фото не існує
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Photo not found');
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'image/jpeg' });
                fs.createReadStream(item.photoPath).pipe(res);
                return;

            } else if (urlParts.length === 2) {
                // GET /inventory/<ID>
                res.writeHead(200, { 'Content-Type': 'application/json' });
                const publicItem = {
                    id: item.id, inventory_name: item.inventory_name,
                    description: item.description, photoUrl: item.photoUrl
                };
                res.end(JSON.stringify(publicItem));
                return;
            }
        }
    }
    if (req.method === 'PUT') {
        const urlParts = req.url.split('/').filter(part => part.length > 0);
        const id = urlParts[1];

        if (urlParts.length === 2 && urlParts[0] === 'inventory') {
            // PUT /inventory/<ID>
            const item = inventory.find(i => i.id === id);

            if (!item) { // 404 Not Found
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Item not found');
                return;
            }

            parseJsonBody(req).then(data => {
                if (data.inventory_name) item.inventory_name = data.inventory_name;
                if (data.description !== undefined) item.description = data.description;
                
                saveInventory();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(item));

            }).catch(err => { // 400 Bad Request: Невалідний JSON
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Invalid JSON body');
            });
            return;
        }
    }
    if (req.method === 'PUT') {
        const urlParts = req.url.split('/').filter(part => part.length > 0);
        const id = urlParts[1];
        
        // ... (існуючий код PUT /inventory/<ID>) ...

        if (urlParts.length === 3 && urlParts[0] === 'inventory' && urlParts[2] === 'photo') {
            // PUT /inventory/<ID>/photo
            const item = inventory.find(i => i.id === id);

            if (!item) { // 404 Not Found
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Item not found');
                return;
            }

            const form = formidable({ uploadDir: CACHE_DIR, keepExtensions: true });

            form.parse(req, (err, fields, files) => {
                const photoFile = files.photo ? (Array.isArray(files.photo) ? files.photo[0] : files.photo) : null;

                if (err || !photoFile) { // 400 Bad Request
                    res.writeHead(400, { 'Content-Type': 'text/plain' });
                    res.end('Photo file missing or upload error');
                    return;
                }
                
                // Видаляємо старе фото
                if (item.photoPath && fs.existsSync(item.photoPath)) {
                    fs.unlinkSync(item.photoPath);
                }

                // Зберігаємо нове фото
                const fileExt = path.extname(photoFile.originalFilename);
                const photoPath = path.join(CACHE_DIR, `${id}${fileExt}`);
                fs.renameSync(photoFile.filepath, photoPath);

                item.photoPath = photoPath;
                item.photoUrl = `/inventory/${id}/photo`;
                saveInventory();

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(item));
            });
            return;
        }
    }
    if (req.method === 'DELETE') {
        const urlParts = req.url.split('/').filter(part => part.length > 0);
        const id = urlParts[1];

        if (urlParts.length === 2 && urlParts[0] === 'inventory') {
            // DELETE /inventory/<ID>
            const itemIndex = inventory.findIndex(i => i.id === id);

            if (itemIndex === -1) { // 404 Not Found
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Item not found');
                return;
            }

            const deletedItem = inventory[itemIndex];
            
            // Видаляємо фото з FS
            if (deletedItem.photoPath && fs.existsSync(deletedItem.photoPath)) {
                fs.unlinkSync(deletedItem.photoPath);
            }

            // Видаляємо запис з інвентарю
            inventory.splice(itemIndex, 1);
            saveInventory();

            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(`Item ${id} deleted successfully.`);
            return;
        }
    }

    // Оновіть фінальний виклик, щоб він включав DELETE
    handleMethodNotAllowed(req, res, ['GET', 'PUT', 'DELETE']);
}
function handleSearch(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });

    req.on('end', () => {
        const formData = querystring.parse(body);
        const id = formData.id;
        const hasPhoto = !!formData.has_photo; 

        const item = inventory.find(i => i.id === id);

        if (!item) { // 404 Not Found
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Item not found');
            return;
        }

        const result = {
            id: item.id,
            inventory_name: item.inventory_name,
            description: item.description
        };

        if (hasPhoto && item.photoUrl) {
            result.photoUrl = item.photoUrl;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
    });
}
function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}
function handleMethodNotAllowed(req, res, allowedMethods) {
    res.writeHead(405, { 
        'Content-Type': 'text/plain', 
        'Allow': allowedMethods.join(', ')
    });
    res.end('405 Method Not Allowed');
}