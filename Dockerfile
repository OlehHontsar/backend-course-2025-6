# Використовуємо офіційний базовий образ Node.js
FROM node:18-alpine
# Встановлюємо робочу директорію в контейнері
WORKDIR /usr/src/app
# Копіюємо файли залежностей (package.json та package-lock.json)
COPY package*.json ./
# Встановлюємо залежності
RUN npm install
# Копіюємо решту коду проєкту (index.js, public/, swagger.json, collection.json)
COPY . .
# Відкриваємо порт 3000 контейнера
EXPOSE 3000
# Запускаємо додаток при старті контейнера
CMD [ "node", "index.js", "-h", "0.0.0.0", "-p", "3000", "-c", "cache" ]