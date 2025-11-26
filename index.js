const http = require('http');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const { program } = require('commander');
const formidable = require('formidable');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json'); 

// --- 1. Налаштування Commander.js ---
program
  .option('-h, --host <host>', 'адреса сервера', 'localhost')
  .option('-p, --port <port>', 'порт сервера', 3000)
  .option('-c, --cache <dir>', 'шлях до директорії кешу', 'cache')
  .parse(process.argv);

// Переконайтеся, що обов'язкові параметри задані, інакше Commander сам виведе помилку і завершить роботу.
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

/**
 * Завантажує дані інвентарю з JSON файлу в пам'ять.
 */
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

/**
 * Зберігає поточний стан інвентарю в JSON файл.
 */
function saveInventory() {
    fs.writeFileSync(INVENTORY_FILE, JSON.stringify(inventory, null, 2), 'utf8');
}

// --- 3. Основний обробник HTTP запитів (Routing Logic) ---

// Для використання swagger-ui-express з чистим http модулем, 
// ми створюємо "проксі" обробник, який імітує поведінку Express.js
const swaggerHandler = swaggerUi.setup(swaggerDocument);
const serveSwaggerUi = swaggerUi.serve;


const server = http.createServer((req, res) => {
    const url = req.url;
    const method = req.method;

    // A. Обслуговування статичних форм та Swagger UI
    if (url.startsWith('/docs')) {
        // Swagger UI на /docs
        // Це вимагає, щоб swagger-ui-express обробляв внутрішні маршрути
        serveSwaggerUi(req, res, () => {
             // Якщо swaggerUi.serve не обробив запит, викликаємо setup для кінцевої сторінки index.html
             swaggerHandler(req, res);
        });
        return;
    }
    
    if (method === 'GET' && (url === '/RegisterForm.html' || url === '/SearchForm.html')) {
        serveStaticFile(path.join(__dirname, 'public', url), res);
        return;
    }
    
    // B. Обробка POST /register
    if (url === '/register' && method === 'POST') {
        handleRegister(req, res);
        return;
    }
    
    // C. Обробка маршрутів, що починаються з /inventory
    if (url.startsWith('/inventory')) {
        const handled = handleInventoryRoutes(req, res);
        if (handled) return;
    }

    // D. Обробка POST /search
    if (url === '/search' && method === 'POST') {
        handleSearch(req, res);
        return;
    }
    
    // E. Обробка 404 Not Found
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
});

// --- 4. Запуск сервера ---
server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}/`);
  console.log(`API Documentation available at http://${HOST}:${PORT}/docs`);
});

// --- 5. Допоміжні функції (з коментарями JSDoc) ---

/**
 * Обслуговує статичні файли з директорії public.
 * @param {string} filePath - Абсолютний шлях до файлу.
 * @param {http.ServerResponse} res - Об'єкт відповіді HTTP.
 */
function serveStaticFile(filePath, res) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end("File not found");
        } else {
            const contentType = filePath.endsWith('.html') ? 'text/html' : 
                                filePath.endsWith('.json') ? 'application/json' : 'text/plain';
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        }
    });
}

/**
 * Обробляє POST-запит для реєстрації нового пристрою (multipart/form-data).
 * @param {http.ClientRequest} req - Об'єкт запиту HTTP.
 * @param {http.ServerResponse} res - Об'єкт відповіді HTTP.
 */
function handleRegister(req, res) {
    // *** ЗАМІНІТЬ ЦЕЙ РЯДОК ***
    // const form = formidable({ uploadDir: CACHE_DIR, keepExtensions: true }); 

    // *** НА ЦЕЙ РЯДОК (використовуйте 'new' та 'IncomingForm') ***
    const form = new formidable.IncomingForm({ 
        uploadDir: CACHE_DIR, 
        keepExtensions: true 
    });

    form.parse(req, (err, fields, files) => {
        if (err) { res.writeHead(500); res.end('Server Error: ' + err.message); return; }

        // formidable v3+ повертає поля (fields) та файли (files) як об'єкти, що містять масиви рядків/об'єкти файлів.
        // Оригінальний код це вже враховував, але зробимо його більш надійним:
        
        // Допоміжна функція для отримання єдиного значення з потенційного масиву
        const getSingleValue = (field) => Array.isArray(field) ? field[0] : field;

        const name = getSingleValue(fields.inventory_name);
        const photoFile = getSingleValue(files.photo);

        if (!name) { 
            // Якщо ім'я відсутнє, видаляємо завантажений файл, якщо він є
            if (photoFile && photoFile.filepath && fs.existsSync(photoFile.filepath)) {
                fs.unlinkSync(photoFile.filepath);
            }
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Error: inventory_name is required.');
            return;
        }

        const id = Date.now().toString(); 
        let photoPath = null;

        if (photoFile) {
            const fileExt = path.extname(photoFile.originalFilename || '.jpg');
            // formidable переміщує файл в uploadDir, нам залишається лише перейменувати його
            photoPath = path.join(CACHE_DIR, `${id}${fileExt}`);
            fs.renameSync(photoFile.filepath, photoPath); 
        }

        const newItem = {
            id: id,
            inventory_name: name,
            photoPath: photoPath, // Зберігаємо внутрішній шлях до файлу
            photoUrl: photoPath ? `/inventory/${id}/photo` : null // URL для доступу до фотографії
        };

        inventory.push(newItem);
        saveInventory();

        res.writeHead(201, { 'Content-Type': 'application/json', 'Location': `/inventory/${id}` }); 
        res.end(JSON.stringify(newItem));
    });
}

/**
 * Обробляє всі маршрути, що стосуються інвентарю (/inventory, /inventory/:id, /inventory/:id/photo).
 * Включає GET, PUT, DELETE методи.
 * @param {http.ClientRequest} req - Об'єкт запиту HTTP.
 * @param {http.ServerResponse} res - Об'єкт відповіді HTTP.
 * @returns {boolean} True, якщо запит був оброблений, інакше False.
 */
function handleInventoryRoutes(req, res) {
    // ... (логіка обробки маршрутів інвентарю з Частини 2) ...
    const urlParts = req.url.split('/').filter(part => part.length > 0);
    const id = urlParts;
    const item = id ? inventory.find(i => i.id === id) : null;
    const isCollectionUrl = urlParts.length === 1 && urlParts === 'inventory';
    const isItemUrl = urlParts.length === 2 && urlParts === 'inventory';
    const isPhotoUrl = urlParts.length === 3 && urlParts === 'photo';
    
    if (urlParts.length >= 2 && urlParts === 'inventory' && !item && req.method !== 'GET') {
         res.writeHead(404, { 'Content-Type': 'text/plain' });
         res.end('Item not found');
         return true;
    }

    if (req.method === 'GET') {
        if (isCollectionUrl) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            const publicInventory = inventory.map(item => ({
                id: item.id, inventory_name: item.inventory_name, description: item.description, photoUrl: item.photoUrl
            }));
            res.end(JSON.stringify(publicInventory));
            return true;
        } 
        
        if (isItemUrl || isPhotoUrl) {
            if (!item) { res.writeHead(404); res.end('Item not found'); return true; }

            if (isPhotoUrl) {
                if (!item.photoPath || !fs.existsSync(item.photoPath)) { res.writeHead(404); res.end('Photo not found'); return true; }
                res.writeHead(200, { 'Content-Type': 'image/jpeg' }); 
                fs.createReadStream(item.photoPath).pipe(res);
                return true;
            } else if (isItemUrl) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                const publicItem = { id: item.id, inventory_name: item.inventory_name, description: item.description, photoUrl: item.photoUrl };
                res.end(JSON.stringify(publicItem));
                return true;
            }
        }
    }
    
    // ... (PUT та DELETE логіка з Частини 2) ...
     if (req.method === 'PUT') {
        if (isItemUrl) {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', () => {
                try {
                    const updates = JSON.parse(body);
                    if (updates.inventory_name !== undefined) item.inventory_name = updates.inventory_name;
                    if (updates.description !== undefined) item.description = updates.description;
                    saveInventory();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(item));
                } catch (e) {
                    res.writeHead(400); res.end('Invalid JSON');
                }
            });
            return true;
        }
         if (isPhotoUrl) {
            const form = formidable({ uploadDir: CACHE_DIR, keepExtensions: true });
            form.parse(req, (err, fields, files) => {
                if (err) { res.writeHead(500); res.end('Server Error'); return; }

                const photoFile = files.photo ? (Array.isArray(files.photo) ? files.photo : files.photo) : null;
                if (!photoFile) { res.writeHead(400); res.end('Photo file missing'); return; }

                if (item.photoPath && fs.existsSync(item.photoPath)) {
                    fs.unlinkSync(item.photoPath);
                }

                const fileExt = path.extname(photoFile.originalFilename || '.jpg');
                const newPhotoPath = path.join(CACHE_DIR, `${id}${fileExt}`);
                fs.renameSync(photoFile.filepath, newPhotoPath);

                item.photoPath = newPhotoPath;
                item.photoUrl = `/inventory/${id}/photo`;
                saveInventory();

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(item));
            });
            return true;
        }
    }

    if (req.method === 'DELETE') {
        if (isItemUrl) {
            if (item.photoPath && fs.existsSync(item.photoPath)) {
                fs.unlinkSync(item.photoPath);
            }
            const index = inventory.findIndex(i => i.id === id);
            inventory.splice(index, 1);
            saveInventory();
            
            res.writeHead(204); // 204 No Content
            res.end();
            return true;
        }
    }
    
    handleMethodNotAllowed(req, res, ['GET', 'PUT', 'DELETE']);
    return true;
}


/**
 * Обробляє POST-запит пошуку пристрою за ID (x-www-form-urlencoded).
 * @param {http.ClientRequest} req - Об'єкт запиту HTTP.
 * @param {http.ServerResponse} res - Об'єкт відповіді HTTP.
 */
function handleSearch(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
        const { id: queryId, has_photo } = querystring.parse(body);

        const item = inventory.find(i => i.id === queryId);

        if (!item) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }

        let responseItem = {
            id: item.id,
            inventory_name: item.inventory_name,
            description: item.description,
        };
        
        if (has_photo === 'on' || has_photo === 'true' || has_photo === true) {
            responseItem.photoUrl = item.photoUrl;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responseItem));
    });
}

/**
 * Відправляє відповідь 405 Method Not Allowed.
 * @param {http.ClientRequest} req - Об'єкт запиту HTTP.
 * @param {http.ServerResponse} res - Об'єкт відповіді HTTP.
 * @param {string[]} allowedMethods - Список дозволених методів для даного ресурсу.
 */
function handleMethodNotAllowed(req, res, allowedMethods) {
    res.writeHead(405, { 
        'Content-Type': 'text/plain',
        'Allow': allowedMethods.join(', ')
    });
    res.end('405 Method Not Allowed');
}