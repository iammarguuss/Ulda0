const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
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
    socket.on('FirstRequest', handleFirstRequest.bind(null, socket));

    //Now user gets the file
    socket.on('requestFile', (message) => {
        console.log('Received message:', message);
    
        let response = { status: true, data: null };
    
        // Проверка имени файла через регулярное выражение
        const fileNamePattern = /^[0-9]+$/;
        if (!fileNamePattern.test(message.fileID)) {
            console.log('Invalid fileID format');
            response = { status: false, message: 'Invalid fileID format' };
        }
    
        // Проверка существования файла
        if (response.status) {
            const filePath = path.join(__dirname, 'files', `${message.fileID}.json`);
            console.log('File path being checked:', filePath);
    
            if (!fs.existsSync(filePath)) {
                console.log(`File ${message.fileID}.json does not exist`);
                response = { status: false, message: 'File does not exist' };
            } else {
                try {
                    const fileData = fs.readFileSync(filePath, 'utf8');
                    console.log('File content:', fileData);
                    response.data = JSON.parse(fileData);
                } catch (err) {
                    console.error('Error reading file:', err);
                    response = { status: false, message: 'Error reading file' };
                }
            }
        }
    
        // Отправка единого ответа
        console.log('Sending response:', response);
        socket.emit('requestFile', response);
    
        // Если проверка провалилась, закрываем соединение
        if (!response.status) {
            console.log('Disconnecting socket due to error');
            socket.disconnect(true);
        }
    
        const fileID = message.fileID

        socket.on('Protocol', (message) => {
            console.log(`Received Protocol request: ${message}`);
        
            if (message === true) {
                console.log("Initializing Protocol...");
        
                // Путь к файлу и метаданным
                const metadataPath = path.join(__dirname, 'files', `${fileID}.json`);
                const filePath = path.join(__dirname, 'files', `${fileID}.bin`);
        
                if (!fs.existsSync(metadataPath) || !fs.existsSync(filePath)) {
                    console.error("File or metadata not found");
                    socket.emit('ProtocolReady', { status: false });
                    return;
                }
        
                try {
                    console.log("Reading metadata...");
                    const metadataContent = fs.readFileSync(metadataPath, 'utf8');
                    const metadata = JSON.parse(metadataContent);
        
                    console.log("Reading binary file...");
                    const fileBuffer = fs.readFileSync(filePath); // Читаем весь бинарный файл
        
                    // Инициализируем объект для хранения чанков
                    const chunks = {};
                    let currentPosition = 0;
        
                    // Получаем числовые ключи из метаданных
                    const chunkKeys = Object.keys(metadata).filter((key) => !isNaN(Number(key)));
                    console.log("Processing chunk keys:", chunkKeys);
        
                    // Разбиваем файл на чанки
                    for (const key of chunkKeys) {
                        const chunkID = parseInt(key, 10); // Преобразуем строковый ключ в число
                        const size = metadata[chunkID]?.size;
        
                        if (!size || typeof size !== 'number') {
                            console.error(`Invalid metadata for chunk ID ${chunkID}:`, metadata[chunkID]);
                            socket.emit('ProtocolReady', { status: false, message: `Invalid metadata for chunk ID ${chunkID}` });
                            return;
                        }
        
                        // Извлекаем часть бинарного файла
                        chunks[chunkID] = fileBuffer.slice(currentPosition, currentPosition + size);
                        currentPosition += size;
                    }
        
                    console.log("All chunks are ready. Sending them to the client...");
        
                    // Отправляем каждый чанк через отдельное событие
                    for (const key of chunkKeys) {
                        const chunkID = parseInt(key, 10);
                        const chunk = chunks[chunkID];
        
                        socket.emit(`chank${chunkID}`, {
                            status: true,
                            chunk,
                            crc32: metadata[chunkID].crc32,
                            size: metadata[chunkID].size,
                        });
        
                        console.log(`Chunk ID ${chunkID} sent to client via chank${chunkID}`);
                    }
        
                    socket.on('chank', (message) => {
                        // Отправляем чанк клиенту
                        const chunk = chunks[message.id];
                        const crc32 = response.data[message.id].crc32;
                        const size = response.data[message.id].size;
                    
                        console.log(`Sending chunk ID ${message.id} to client...`);
                        socket.emit(`chank${message.id}`, {
                            status: true,
                            chunk,
                            crc32,
                            size,
                        });
                    });

                    
                    // Протокол готов
                    //socket.emit('ProtocolReady', { status: true });
                } catch (err) {
                    console.error("Error initializing Protocol:", err);
                    socket.emit('ProtocolReady', { status: false });
                }
            }
        });

        socket.on('IamDone', () => {
            console.log("User is done here");
            socket.off('requestFile', () => {});
        });

        setTimeout(() => {
            console.log(`Timeout for ${socket.id}, stopping 'FirstRequest' listener.`);
            socket.off('requestFile', () => {});
        }, 120000);
    
    });
    

    socket.on('disconnect', () => {
        console.log('Пользователь отключен');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});


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


function CRC32 (str) {
    const makeCRCTable = () => {
        let c;
        const crcTable = [];
        for (let n = 0; n < 256; n++) {
            c = n;
            for (let k = 0; k < 8; k++) {
                c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
            }
            crcTable[n] = c;
        }
        return crcTable;
    };

    const crcTable = this.crcTable || (this.crcTable = makeCRCTable());
    let crc = 0 ^ (-1);

    for (let i = 0; i < str.length; i++) {
        const byte = str.charCodeAt(i);
        crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xFF];
    }

    return (crc ^ (-1)) >>> 0; // Return as unsigned integer
}

function CRC32Byte (data) {
    const makeCRCTable = () => {
        let c;
        const crcTable = new Array(256);
        for (let n = 0; n < 256; n++) {
            c = n;
            for (let k = 0; k < 8; k++) {
                c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
            }
            crcTable[n] = c;
        }
        return crcTable;
    };

    const crcTable = this.crcTable || (this.crcTable = makeCRCTable());
    let crc = 0 ^ (-1);

    for (let i = 0; i < data.length; i++) {
        const byte = data[i];
        crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xFF];
    }

    return (crc ^ (-1)) >>> 0; // Return as unsigned integer
}

function sha256 (data) {
    return crypto.createHash('sha256').update(data).digest('hex');
};




function handleFirstRequest(socket, message) {

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

    // drop connection if not passed the check
    if(!response.status){
        //socket.disconnect(true);
        socket.off('FirstRequest', ()=>{});
        return;
    }


    const FileParts = {};
    const TheFile = "";
    const FileProofs = {};
    //Trying to recive the file
    // may be should be changed later
    socket.on('startFileTransfer', (data) => {
        console.log('Received initial file transfer data', data);

        // Производим необходимые проверки
        let isValid = true;
        FileProofs.signatures = {}
        FileProofs.signatures[5] = data.signatures;
        FileParts[0] = data.zeroChunk;
        FileProofs.size = data.proofer;
        //FileProofs.size.key => has the key to allow it to be deleted

        isValid = CRC32Byte(data.zeroChunk) === FileProofs.size[0].crc32 ? true : false

        if (isValid) {
            console.log('Initial data is valid');
            socket.emit('initialDataReceived', { status: true, message: 'Initial data received and validated.' });
        } else {
            console.log('Initial data is invalid');
            socket.emit('error', { status: false, message: 'Initial data validation failed.' });
            //socket.disconnect(true);
            socket.off('FirstRequest', ()=>{});
            return;
        }

        // actual sending chunkings
        socket.on('Protocol', (msg) => {
            if (typeof FileProofs.signatures[msg.level] === "undefined") {
                FileProofs.signatures[msg.level] = {};
            }
            let chank_status = true; 
            //checkSize
            chank_status = CRC32Byte(msg.chunk) === FileProofs.size[msg.id].crc32 ? true : false
            //if(!chank_status) console.log("CRC32 shited itself");
            chank_status = msg.chunk.byteLength === FileProofs.size[msg.id].size ? true : false
            //if(!chank_status) console.log("SIZEING shited itself");
            chank_status = (sha256(msg.sign) === FileProofs.signatures[msg.level+1][msg.id]) ? true : false
            FileProofs.signatures[msg.level][msg.id] = sha256(msg.sign);  // updateing the very last one
            //if(!chank_status) console.log("SIGNATURING shited itself");
            console.log("We tested chunk number " + msg.id)

            //////////////////////////FORCE ERROR TO CHECK IF IT WORKS//////////////////////////
            //chank_status = Math.random() < 0.5;
            //////////////////////////FORCE ERROR TO CHECK IF IT WORKS//////////////////////////
            
            socket.emit('Chank'+msg.id, { status: chank_status, id: msg.id,level:msg.level });
        
            if(chank_status){
                FileParts[msg.id] = msg.chunk;
            }
        });

        //wait for the end of the connection and then start assmbling the file
        socket.on('finalStatus', (msg) => {
            if (!msg.status) {
                // Очистка, если передача была неуспешной
                var props = Object.getOwnPropertyNames(FileParts);
                for (var i = 0; i < props.length; i++) {
                    delete FileParts[props[i]];
                }
                socket.emit('finalResponse', { status: false });
                socket.off('FirstRequest', ()=>{});
                return;
            } else {
                // Сборка и сохранение файла
                const fileLocation = path.join(__dirname, 'files', `${Date.now()}`);
                const data = Object.values(FileParts).reduce((acc, part) => Buffer.concat([acc, Buffer.from(part)]), Buffer.alloc(0));
                
                // Сохранение собранного файла
                fs.writeFile(`${fileLocation}.bin`, data, (err) => {
                    if (err) {
                        console.error('Failed to save the file:', err);
                        socket.emit('finalResponse', { status: false });
                        socket.off('FirstRequest', ()=>{});
                        return;
                    }
    
                    // Сохранение метаданных в JSON
                    fs.writeFile(`${fileLocation}.json`, JSON.stringify(FileProofs.size), (err) => {
                        if (err) {
                            console.error('Failed to save metadata:', err);
                            socket.emit('finalResponse', { status: false });
                            socket.off('FirstRequest', ()=>{});
                            return;
                        }
    
                        // Все успешно сохранено
                        console.log('File and metadata saved successfully.');
                        socket.emit('finalResponse', { status: true, fileLocation: path.basename(fileLocation) });
                        socket.off('FirstRequest', ()=>{});
                        return 
                    });
                });
            }
        });        
    }); 

    setTimeout(() => {  // if user disconnected by mistake
        console.log(`Timeout for ${socket.id}, stopping 'FirstRequest' listener.`);
        // Отключаем прослушивание события 'FirstRequest'
        socket.off('FirstRequest', ()=>{});
        //socket.disconnect(true);
    }, 120000);
}
