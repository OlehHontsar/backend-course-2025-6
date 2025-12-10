const express = require('express');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const formidable = require('formidable');
const swaggerUi = require('swagger-ui-express');

// --- ВБУДОВАНИЙ SWAGGER.JSON ДЛЯ ЗАВДАННЯ ---
const swaggerDocument = {
  "openapi": "3.0.0",
  "info": {
    "title": "API Сервісу Інвентаризації Пристроїв",
    "description": "API для управління інвентаризованими пристроями, включаючи реєстрацію, пошук та оновлення даних і фотографій.",
    "version": "1.0.0"
  },
  "servers": [
    {
      "url": "http://localhost:3000",
      "description": "Локальний сервер розробки"
    }
  ],
  "paths": {
    "/register": {
      "post": {
        "summary": "Реєстрація нового пристрою (multipart/form-data)",
        "operationId": "registerDevice",
        "requestBody": {
          "required": true,
          "content": {
            "multipart/form-data": {
              "schema": {
                "type": "object",
                "properties": {
                  "inventory_name": {
                    "type": "string",
                    "description": "Ім’я речі (обов'язкове поле)"
                  },
                  "description": {
                    "type": "string",
                    "description": "Опис речі"
                  },
                  "photo": {
                    "type": "string",
                    "format": "binary",
                    "description": "Файл фото зображення"
                  }
                },
                "required": ["inventory_name"]
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Пристрій успішно створено",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/InventoryItem" }
              }
            }
          },
          "400": {
            "description": "Помилка валідації (ім’я не задано)"
          },
          "500": {
            "description": "Помилка завантаження файлу"
          }
        }
      }
    },
    "/inventory": {
      "get": {
        "summary": "Отримання списку всіх інвентаризованих речей",
        "operationId": "listInventory",
        "responses": {
          "200": {
            "description": "Успішне отримання списку речей",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": { "$ref": "#/components/schemas/InventoryItem" }
                }
              }
            }
          }
        }
      }
    },
    "/inventory/{ID}": {
      "get": {
        "summary": "Отримання інформації про конкретну річ за ID",
        "operationId": "getInventoryItemById",
        "parameters": [
          { "name": "ID", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "responses": {
          "200": {
            "description": "Успішне отримання даних",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/InventoryItem" }
              }
            }
          },
          "404": { "description": "Річ не знайдена" }
        }
      },
      "put": {
        "summary": "Оновлення імені або опису конкретної речі (JSON)",
        "operationId": "updateInventoryItem",
        "parameters": [
          { "name": "ID", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "inventory_name": { "type": "string" },
                  "description": { "type": "string" }
                }
              }
            }
          }
        },
        "responses": {
          "200": { "description": "Дані успішно оновлено" },
          "404": { "description": "Річ не знайдена" }
        }
      },
      "delete": {
        "summary": "Видалення інвентаризованої речі зі списку за ID",
        "operationId": "deleteInventoryItem",
        "parameters": [
          { "name": "ID", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "responses": {
          "200": { "description": "Річ успішно видалено" },
          "404": { "description": "Річ не знайдена" }
        }
      }
    },
    "/inventory/{ID}/photo": {
      "get": {
        "summary": "Отримання фото зображення конкретної речі",
        "operationId": "getPhoto",
        "parameters": [
          { "name": "ID", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "responses": {
          "200": {
            "description": "Успішне повернення зображення (image/jpeg)",
            "content": {
              "image/jpeg": { "schema": { "type": "string", "format": "binary" } }
            }
          },
          "404": { "description": "Річ або фото не існує" }
        }
      },
      "put": {
        "summary": "Оновлення фото зображення конкретної речі",
        "operationId": "updatePhoto",
        "parameters": [
          { "name": "ID", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "multipart/form-data": {
              "schema": {
                "type": "object",
                "properties": {
                  "photo": { "type": "string", "format": "binary" }
                },
                "required": ["photo"]
              }
            }
          }
        },
        "responses": {
          "200": { "description": "Фото успішно оновлено" },
          "404": { "description": "Річ не знайдена" }
        }
      }
    },
    "/search": {
      "post": {
        "summary": "Обробка запиту пошуку пристрою за ID (x-www-form-urlencoded)",
        "operationId": "searchDevice",
        "requestBody": {
          "required": true,
          "content": {
            "application/x-www-form-urlencoded": {
              "schema": {
                "type": "object",
                "properties": {
                  "id": { "type": "string", "description": "Серійний номер/ID пристрою" },
                  "has_photo": { "type": "string", "description": "Прапорець для перевірки наявності фото ('on' якщо встановлено)" }
                },
                "required": ["id"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Річ знайдена",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/InventoryItem" }
              }
            }
          },
          "404": { "description": "Річ не знайдена або фото відсутнє" }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "InventoryItem": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "example": "1678886400000" },
          "inventory_name": { "type": "string", "example": "Ноутбук Dell XPS" },
          "description": { "type": "string", "example": "Опис моделі 2024 року" },
          "photo_url": { "type": "string", "nullable": true, "example": "/inventory/1678886400000/photo" }
        }
      }
    }
  }
};

// --- 1. Налаштування Commander.js та параметри командного рядка (Частина 1) ---
program
  .option('-h, --host <host>', 'адреса сервера', 'localhost')
  .option('-p, --port <port>', 'порт сервера', 3000)
  .option('-c, --cache <dir>', 'шлях до директорії кешу', 'cache')
  .parse(process.argv);

const options = program.opts();

if (!options.host || !options.port || !options.cache) {
    console.error("Помилка: Необхідно вказати всі обов'язкові параметри (--host, --port, --cache).");
    program.help();
    process.exit(1);
}

const HOST = options.host;
const PORT = options.port;
const CACHE_DIR = path.resolve(process.cwd(), options.cache);
const INVENTORY_FILE = path.join(CACHE_DIR, 'inventory.json');
const PHOTOS_DIR = path.join(CACHE_DIR, 'photos');

// Створення директорій під час запуску, якщо їх немає
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}
if (!fs.existsSync(PHOTOS_DIR)) {
    fs.mkdirSync(PHOTOS_DIR, { recursive: true });
}

// --- 2. Ініціалізація сховища даних ---
let inventory = [];

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

// --- 3. Ініціалізація додатку Express та Middleware ---

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));


// --- 4. Реалізація маршрутів API (Частина 2) ---

// GET /docs - Документація API (Частина 3)
// Тепер використовує вбудовану константу swaggerDocument
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Middleware для пошуку речі за ID
const findItemById = (req, res, next) => {
    const item = inventory.find(i => i.id === req.params.ID);
    if (!item) {
        return res.status(404).json({ error: `Річ з ID ${req.params.ID} не знайдена` });
    }
    req.item = item;
    next();
};

// *** ОБРОБНИК ДЛЯ GET / (виправляє помилку "Cannot GET /" і додає посилання) ***
app.get('/', (req, res) => {
    res.send(`<h1>Сервер працює!</h1>
              <p>Документація API доступна тут: 
              <a href="http://${HOST}:${PORT}/docs">http://${HOST}:${PORT}/docs</a></p>
              <p>Форми: 
              <a href="http://${HOST}:${PORT}/RegisterForm.html">RegisterForm.html</a> та 
              <a href="http://${HOST}:${PORT}/SearchForm.html">SearchForm.html</a></p>`);
});

// POST /register - Реєстрація нового пристрою (multipart/form-data)
app.post('/register', (req, res) => {
    const form = formidable({ uploadDir: PHOTOS_DIR, keepExtensions: true });
    form.parse(req, (err, fields, files) => {
        if (err) return res.status(500).json({ error: 'Помилка завантаження файлу' });

        // Normalize formidable fields to handle potential array formats
        const name = Array.isArray(fields.inventory_name) ? fields.inventory_name[0] : fields.inventory_name;
        const description = Array.isArray(fields.description) ? fields.description[0] : fields.description;
        const photoFile = Array.isArray(files.photo) ? files.photo[0] : files.photo;

        if (!name) { // 400 Bad Request
            if (photoFile && photoFile.filepath) fs.unlinkSync(photoFile.filepath);
            return res.status(400).json({ error: 'Поле inventory_name є обов\'язковим' });
        }

        const newId = Date.now().toString();
        // Встановлюємо photo_url, що відповідає маршруту GET /inventory/<ID>/photo
        const photoUrl = photoFile ? `/inventory/${newId}/photo?filename=${path.basename(photoFile.filepath)}` : null;
// a ? b : c
        const newItem = { id: newId, inventory_name: name, description: description, photo_url: photoUrl };
        inventory.push(newItem);
        saveInventory();
        res.status(201).json(newItem); // 201 Created
    });
});

// GET /inventory - Отримання списку всіх інвентаризованих речей
app.get('/inventory', (req, res) => {
    res.status(200).json(inventory);
});

// GET /inventory/<ID> - Отримання інформації про конкретну річ
app.get('/inventory/:ID', findItemById, (req, res) => {
    res.status(200).json(req.item);
});

// PUT /inventory/<ID> - Оновлення імені або опису конкретної речі (JSON)
app.put('/inventory/:ID', findItemById, (req, res) => {
    const { inventory_name, description } = req.body;
    if (inventory_name) req.item.inventory_name = inventory_name;
    if (description) req.item.description = description;
    saveInventory();
    res.status(200).json(req.item);
});

// GET /inventory/<ID>/photo - Отримання фото
app.get('/inventory/:ID/photo', findItemById, (req, res) => {
    if (!req.item.photo_url) return res.status(404).json({ error: 'Фото відсутнє' });
    
    // Використовуємо basename, щоб знайти файл на диску
    const fileNameOnDisk = path.basename(req.item.photo_url.split('?')[0]); 
    const photoPath = path.join(PHOTOS_DIR, fileNameOnDisk);

    fs.access(photoPath, fs.constants.F_OK, (err) => {
        if (err) return res.status(404).json({ error: 'Файл фотографії не знайдено на диску' });
        res.setHeader('Content-Type', 'image/jpeg');
        res.status(200).sendFile(photoPath);
    });
});

// PUT /inventory/<ID>/photo - Оновлення фото
app.put('/inventory/:ID/photo', findItemById, (req, res) => {
    const form = formidable({ uploadDir: PHOTOS_DIR, keepExtensions: true });
    form.parse(req, (err, fields, files) => {
        if (err) return res.status(500).json({ error: 'Помилка завантаження файлу' });
        const photoFile = Array.isArray(files.photo) ? files.photo[0] : files.photo;
        if (!photoFile) return res.status(400).json({ error: 'Файл фото не надано' });
        
        if (req.item.photo_url) { // Видаляємо старе фото
            const oldFileName = path.basename(req.item.photo_url.split('?')[0]);
            const oldPhotoPath = path.join(PHOTOS_DIR, oldFileName);
            if (fs.existsSync(oldPhotoPath)) fs.unlinkSync(oldPhotoPath);
        }

        // Оновлюємо URL з новим ім'ям файлу
        req.item.photo_url = `/inventory/${req.item.id}/photo?filename=${path.basename(photoFile.filepath)}`;
        saveInventory();
        res.status(200).json({ message: 'Фото оновлено', item: req.item });
    });
});

// DELETE /inventory/<ID>
app.delete('/inventory/:ID', findItemById, (req, res) => {
    if (req.item.photo_url) { // Видаляємо фото
        const fileNameOnDisk = path.basename(req.item.photo_url.split('?')[0]);
        const photoPath = path.join(PHOTOS_DIR, fileNameOnDisk);
        if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
    }
    inventory = inventory.filter(i => i.id !== req.params.ID);
    saveInventory();
    res.status(200).json({ message: `Річ з ID ${req.params.ID} видалено` });
});

// POST /search (x-www-form-urlencoded)
app.post('/search', (req, res) => {
    const { id, has_photo } = req.body;
    const item = inventory.find(i => i.id === id);

    if (!item) return res.status(404).json({ error: `Річ з ID ${id} не знайдена` });
    
    // Перевіряємо прапорець has_photo ('on' або відсутній)
    if (has_photo === 'on' && !item.photo_url) {
        return res.status(404).json({ error: `Річ з ID ${id} знайдена, але фото відсутнє` });
    }
    res.status(200).json(item);
});


// --- 5. Запуск сервера ---

// Запуск сервера з параметрами HOST та PORT з Commander.js
app.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}/`);
    console.log(`API Documentation available at http://${HOST}:${PORT}/docs`);
});