const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Подключение папки public как статической
app.use(express.static(path.join(__dirname, 'public')));

// Обработчик событий Socket.IO
io.on('connection', (socket) => {
    console.log('Пользователь подключен');

    // Получение файла от клиента
    socket.on('file upload', (file) => {
        // Здесь можно обрабатывать файл, например, добавлять в класс
        console.log(file);
        // Отправляем подтверждение обратно клиенту
        socket.emit('file received', 'Файл получен');
    });

    socket.on('disconnect', () => {
        console.log('Пользователь отключен');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
