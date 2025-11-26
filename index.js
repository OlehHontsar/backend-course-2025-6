const http = require('http');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const { program } = require('commander');
const formidable = require('formidable');
const swaggerUi = require('swagger-ui-express');
// Припускаємо, що swagger.json існує в тій же директорії
const swaggerDocument = require('./swagger.json'); 

// --- 1. Налаштування Commander.js ---
// ... (існуючий код Commander) ...
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
// ... (існуючий код ініціалізації сховища) ...
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
    // Middleware для Swagger UI з використанням чистого http модуля
    if (req.url.startsWith('/docs')) {
        // swagger-ui-express очікує формат req/res Express.js, 
        // що сумісний з нативним http модулем Node.js
        swaggerUi.serve[0](req, res, () => {
            swaggerUi.setup(swaggerDocument)(req, res);
        });
        return;
    }

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

    // --- E. Обробка 404 та 405 (кінцева логіка) ---
    const knownBaseUrls = ['/register', '/inventory', '/search', '/RegisterForm.html', '/SearchForm.html', '/docs'];
    
    // Витягуємо базову частину URL (наприклад, з /inventory/123/photo отримуємо /inventory)
    // Обробляємо корінь / окремо
    const requestBaseUrl = url === '/' ? '/' : '/' + url.split('/').filter(part => part.length > 0)[0];

    if (knownBaseUrls.includes(requestBaseUrl)) {
        // Ми знаємо цей URL, але метод не підтримується
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
  console.log(`Swagger UI available at http://${HOST}:${PORT}/docs`);
});

// --- 5. Допоміжні функції ---

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
            const itemIndex = inventory.findIndex(i => i.id === id);

            if (itemIndex === -1) { // 404 Not Found
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Item not found');
                return;
            }
            
            // Очікуємо JSON тіло для оновлення
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    const updates = JSON.parse(body);
                    if (updates.inventory_name) inventory[itemIndex].inventory_name = updates.inventory_name;
                    if (updates.description) inventory[itemIndex].description = updates.description;
                    
                    saveInventory();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(inventory[itemIndex]));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'text/plain' });
                    res.end('Invalid JSON body');
                }
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
            
            const [deletedItem] = inventory.splice(itemIndex, 1);
            
            // Видаляємо файл фото, якщо він існує
            if (deletedItem.photoPath && fs.existsSync(deletedItem.photoPath)) {
                fs.unlinkSync(deletedItem.photoPath);
            }

            saveInventory();
            res.writeHead(204); // 204 No Content
            res.end();
            return;
        }
    }

    // Якщо жоден з обробників не спрацював, повертаємо управління основному роутингу
    // де спрацює 404 або 405.
}

function handleSearch(req, res) {
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });
    req.on('end', () => {
        const formData = querystring.parse(body);
        const query = formData.query ? formData.query.toLowerCase() : '';

        const results = inventory.filter(item => {
            return item.inventory_name.toLowerCase().includes(query) ||
                   item.description.toLowerCase().includes(query);
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(results.map(item => ({
            id: item.id,
            inventory_name: item.inventory_name,
            description: item.description,
            photoUrl: item.photoUrl
        }))));
    });
}

function handleMethodNotAllowed(req, res, allowedMethods) {
    res.writeHead(405, { 
        'Content-Type': 'text/plain',
        'Allow': allowedMethods.join(', ') // Повідомляємо клієнту, які методи дозволені
    });
    res.end('405 Method Not Allowed');
}