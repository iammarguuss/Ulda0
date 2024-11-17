const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Подключение папки public как статической
app.use(express.static(path.join(__dirname, 'public')));

const GlobalTestKey = "This key should be created by another class and provided to the server";

// Обработчик событий Socket.IO
io.on('connection', (socket) => {
    console.log('User is UP');
 
    // Получение файла от клиента
    socket.on('FirstRequest', (message) => {
        console.log('Received message:', message);
        const response = {
            status: true,
            end: null
        };

        const result = generateCustomSaltedHashSync(GlobalTestKey, message.salt);
        if (result.splitHash[0] !== message.start) {
            response.status = false;
            console.log('Hash check failed');
        } else {
            response.end = result.splitHash[1];
            console.log('Hash check succeeded');
        }

        console.log('Sending response:', response);
        // Отправляем подтверждение обратно клиенту
        socket.emit('FirstResponse', response);
    });

    socket.on('disconnect', () => {
        console.log('Пользователь отключен');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});






// class CryptoUtils {
//     // Метод для генерации SHA-256 хэша
//     static sha256(data) {
//         const hash = crypto.createHash('sha256');
//         hash.update(data);
//         return hash.digest('hex');  // Возвращает хэш в виде hex-строки
//     }
// }

function generateCustomSaltedHashSync(text, providedSalt) {
    const sha256 = (data) => {
        return crypto.createHash('sha256').update(data).digest('hex');
    };

    // Используем предоставленную соль
    const randomSalt = providedSalt;

    // Генерация хэшей
    const textHash = sha256(text);
    const saltHash = sha256(randomSalt);
    const xorValue = (parseInt(saltHash, 16) ^ parseInt(textHash, 16)).toString(16); // XOR операция между хэшами

    const combinedHash = sha256(`${text}${randomSalt}${xorValue}`);

    // Разделение хэша
    const halfIndex = Math.ceil(combinedHash.length / 2);
    const splitHash = [combinedHash.substring(0, halfIndex), combinedHash.substring(halfIndex)];

    return { randomSalt, hash: combinedHash, splitHash };
}
