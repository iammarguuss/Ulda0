class FileProcessor {
    constructor(config) {
        this.config = config;
        this.socket = io({
            host: config.serverHost,
            port: config.serverPort,
            // Дополнительная конфигурация, если нужна
        });
    }

    async sendFile(file, key, passwordConfig) {
        try{
            // TODO test if the connection is up

            const starting = await this.SendFileProcessing.SaltSplitter(key);
            console.log('Starting data:', starting);
        
            const firstPackRunner = {
                salt: starting.salt,
                start: starting.splitHash[0]
            };
        
            const try_connect = await new Promise((resolve) => {
                let DropMe = false
                this.socket.emit('FirstRequest', firstPackRunner, (response) => {
                    if (response.error) {
                        DropMe = true;
                        resolve({ success: false, message: 'No response from server, server is down' }); // Ошибка отправки файла
                        return
                    } else {resolve(response); // Успешный ответ от сервера
                    }
                });
                // Слушаем ответ на правильное событие
                this.socket.on('FirstResponse', (response) => {
                    console.log(DropMe)
                    if(DropMe){return resolve()}
                    console.log(response);
                    if (response.status && response.end === starting.splitHash[1]) {
                        console.log('Positive response from server:', response);
                        resolve({ success: true, message: 'We can start uploading' });
                    } else {
                        console.log('Error response from server:', 'Verification failed');
                        resolve({ success: false, message: 'Error sending file: Verification failed' });
                    }
                });
                // Тайм-аут
                setTimeout(() => {
                    DropMe = true;
                    resolve({ success: false, message: 'Timeout: No response from server' });
                }, 3000); // or kill connection
            });
        
            // here we have established our connection to the server
            if(!try_connect.success){
                return {status:false,message:try_connect.message}
            }

            ///////////////////// Now lets encrypt the file then))) ///////////////////////
            const fileMeta = this.SendFileProcessing.GetMeta(file)
            console.log(fileMeta)

            // check max file size
            if(this.config.MAX_FILE_SIZE < fileMeta.Meta.size){
                return {status:false,message:"File is just too big :("}
            }

            // cutting chunks
            let chunks = await this.SendFileProcessing.fileSplitter(file);
            console.log("Chanks are splitted in ",chunks)

            // signing via crc32
            //chunks = await this.SendFileProcessing.OriginSigning(chunks)
            await this.SendFileProcessing.OriginSigning(chunks)
            console.log(chunks)

            // generating keis and ivs
            await this.SendFileProcessing.generateKeysAndIVs(chunks);
            console.log(chunks)

            // encrypting chanks
            await this.SendFileProcessing.encryptChunks(chunks);
            console.log(chunks)

            //encrypt 1st chank and signature crc32 => start sending proccess  =)
            chunks[0] = await this.localCrypto.newEncContentFile(chunks[0],passwordConfig)
            console.log(chunks[0])

            const proofer = await this.SendFileProcessing.saveChunkMetadata(chunks)
            proofer.key = await this.localCrypto.Sha256(passwordConfig.toDeleteKey)
            console.log(proofer)

            const signatures = await this.localCrypto.sendGetFunSignatures(Object.keys(chunks).length); // giving signatures array to proof the delivery
            console.log(signatures);

            const serverResponse = await this.SendFileProcessing.initSender(chunks, signatures, proofer);
            console.log(serverResponse)
            
            if(!serverResponse.status){
                return {status:false,message:"Server is down or the code shited itself"}
            }

            const SuperSender = await this.SendFileProcessing.FileTransfer(chunks,signatures)
            console.log(SuperSender)

            const FinalReporter = await this.SendFileProcessing.FinalReporter(SuperSender)
            console.log(FinalReporter)

            if(!SuperSender) { 
                return {status:false,message:"File was not uploaded"}
            }else{
                // this is the end
                return FinalReporter
            }
        }
        catch{
            // may be disconnect the client, as an idea
            return {status:false,message:"Code was modifed and droped an error. RELOAD THE PAGE!"}
        }
    }
    
    

    localCrypto = {
        Sha256: async (text) => {
            const encoder = new TextEncoder();
            const data = encoder.encode(text);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            return hashHex;
        },
        CRC32: (str) => {
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
        },
        CRC32Byte: (buffer) => {
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
    
            const crcTable = makeCRCTable();
            let crc = 0 ^ (-1);
    
            for (let i = 0; i < buffer.byteLength; i++) {
                crc = (crc >>> 8) ^ crcTable[(crc ^ buffer[i]) & 0xFF];
            }
    
            return (crc ^ (-1)) >>> 0; // Возвращаем как беззнаковое целое число
        },    
        aesEncrypt: async (data, key, iv) => {
            const algo = {
                name: "AES-CBC",
                iv: iv
            };
            return crypto.subtle.encrypt(algo, key, data);
        },
        importKey: async (base64Key, algo) => {
            const rawKey = this.localCrypto.base64ToArrayBuffer(base64Key);
            return crypto.subtle.importKey(
                "raw",
                rawKey,
                algo,
                false,
                ["encrypt"]
            );
        },
        base64ToArrayBuffer: (base64) => {
            const binaryString = window.atob(base64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
        },
        newEncContentFile: async (file,passwordSettings) => {    // get from ulda0
            const { password, iv, salt } = passwordSettings;
        
            const encoder = new TextEncoder();
            const data = encoder.encode(JSON.stringify(file));
          
            // Генерация случайных байтов (32 байта)
            const randomBytes = crypto.getRandomValues(new Uint8Array(32));
            
            // Создание нового массива для данных с дополнительными байтами
            const newData = new Uint8Array(randomBytes.length + data.length);
            newData.set(randomBytes, 0);
            newData.set(data, randomBytes.length);
          
            // Создание соли в виде байтового массива для XOR операции
            const saltBytes = encoder.encode(salt);
            const saltedData = new Uint8Array(newData.length);
          
            // Применение XOR между каждым байтом новых данных и солью
            for (let i = 0; i < newData.length; i++) {
              saltedData[i] = newData[i] ^ saltBytes[i % saltBytes.length];
            }
          
            // Преобразование пароля в ключ (обеспечение нужной длины 256 бит)
            const passwordBytes = encoder.encode(password).slice(0, 32);
            const key = await crypto.subtle.importKey(
              "raw",
              passwordBytes, // Теперь пароль точно 256 бит
              { name: "AES-CBC" },
              false,
              ["encrypt"]
            );
          
            const ivArray = new Uint8Array(iv.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
          
            // Шифрование солёных данных
            const encryptedData = await crypto.subtle.encrypt(
              {
                name: "AES-CBC",
                iv: ivArray
              },
              key,
              saltedData
            );
          
            return new Uint8Array(encryptedData);
        },
        CRC32Byte: (data) => {
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
        },
        sendGetFunSignatures: async (chunkCount) => {
            const signatures = {};
            for (let level = 0; level < 6; level++) { // 5 итераций подписей
                signatures[level] = {}; // Создаем новый объект для каждого уровня
                for (let i = 0; i < chunkCount; i++) {
                    if (level === 0) {
                        // Для первого уровня генерируем случайные строки
                        const randomString = crypto.getRandomValues(new Uint8Array(32));
                        const string = btoa(String.fromCharCode.apply(null, randomString));
                        signatures[level][i] = string;
                    } else {
                        // Для последующих уровней генерируем хеш от предыдущей подписи
                        const previousSignature = signatures[level - 1][i];
                        const hash = await this.localCrypto.Sha256(previousSignature);
                        signatures[level][i] = hash;
                    }
                }
            }
            return signatures;
        }
    };

    SendFileProcessing = {
        SaltGenerator: async (text) => {    // генерируем подпись от ключа
            const randomBytes = crypto.getRandomValues(new Uint8Array(24)); // Генерация 24 случайных байтов
            const randomSalt = btoa(String.fromCharCode(...randomBytes)); // Преобразование в строку Base64
            const textHash = await this.localCrypto.Sha256(text);
            const saltHash = await this.localCrypto.Sha256(randomSalt);
            const xorValue = parseInt(saltHash, 16) ^ parseInt(textHash, 16); // XOR операция между хэшами
            const combinedHash = await this.localCrypto.Sha256(`${text}${randomSalt}${xorValue.toString(16)}`);
            return { randomSalt, hash: combinedHash };
        },
        SaltSplitter: async (text) => {     // делим соль на 2, что бы отправить половину и сверить
            const { randomSalt, hash } = await this.SendFileProcessing.SaltGenerator(text);
            const halfIndex = Math.ceil(hash.length / 2);
            return { salt: randomSalt, splitHash: [hash.substring(0, halfIndex), hash.substring(halfIndex)] };
        },
        GetMeta: (file) => {
            const basicMeta = {
                lastModified: file.lastModified,
                lastModifiedDate: file.lastModifiedDate,
                name: file.name,
                size: file.size,
                type: file.type // MIME-тип файла
            };
            // Определяем тип файла для дальнейшей обработки
            let fileType = 'other';
            if (file.type.startsWith('image/')) {fileType = 'image';} 
            else if (file.type.startsWith('audio/')) {fileType = 'audio';} 
            else if (file.type.startsWith('video/')) {fileType = 'video';} 
            else if (file.type.startsWith('application/')) {fileType = 'document';}
            // Возвращаем стандартные метаданные вместе с определенным типом файла
            return {
                Name: file.name,
                Type: fileType,
                Meta: basicMeta
            };
        },
        fileSplitter: async (file) => {
            const CHUNK_SIZE = 256 * 1024; // 256 КБ в байтах
            let chunks = {};
            let currentChunk = 1;
    
            for (let start = 0; start < file.size; start += CHUNK_SIZE) {
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const blob = file.slice(start, end); // Получаем часть файла как Blob
                // Асинхронно читаем блоб и ждем его загрузки перед продолжением
                await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = function() {
                        // Сохраняем содержимое чанка в виде байтового массива
                        chunks[currentChunk] = new Uint8Array(this.result);
                        currentChunk++;
                        resolve();
                    };
                    reader.readAsArrayBuffer(blob);
                });
            }
            return chunks; // Возвращаем объект с чанками
        },
        OriginSigning: async (chunks) => {
            // Проверка наличия контейнера для подписей
            if (!chunks[0]) {chunks[0] = { origins: {} };}
            // Подписываем каждый чанк
            for (const chunkNumber in chunks) {
                if (chunkNumber === "0") continue; // Пропускаем контейнер для подписей
                const chunk = chunks[chunkNumber];
                const signature = this.localCrypto.CRC32(chunk.toString());
                chunks[0].origins[chunkNumber] = signature;
            }
            return chunks;
        },
        generateKeysAndIVs: async (chunks) => {
        chunks[0].keys = {};

        for (const chunkNumber in chunks) {
            if (chunkNumber === "0") continue; // Пропускаем специальный контейнер для ключей и IVs
            // Генерируем случайный ключ и IV для AES-256
            const keyBuffer = crypto.getRandomValues(new Uint8Array(32)); // AES-256 требует ключ длиной 256 бит (32 байта)
            const ivBuffer = crypto.getRandomValues(new Uint8Array(16)); // AES блок 128 бит (16 байт)
            // Сохраняем ключ и IV в специальном контейнере
            chunks[0].keys[chunkNumber] = {
                key: btoa(String.fromCharCode.apply(null, keyBuffer)), // Конвертируем Uint8Array в строку, потом в Base64
                iv: btoa(String.fromCharCode.apply(null, ivBuffer))
            };
        }
        },
        encryptChunks: async (chunks) => {
            const algo = {name: "AES-CBC",length: 256};

            for (let chunkNumber = 1; chunkNumber < Object.keys(chunks).length; chunkNumber++) {
                const chunk = chunks[chunkNumber];
                const keyData = chunks[0].keys[chunkNumber];
                const key = await this.localCrypto.importKey(keyData.key, algo);
                const iv = this.localCrypto.base64ToArrayBuffer(keyData.iv);

                const encryptedChunk = await this.localCrypto.aesEncrypt(chunk,key,iv);
                // Заменяем оригинальный чанк его зашифрованной версией
                chunks[chunkNumber] = new Uint8Array(encryptedChunk);
            }
        },
        saveChunkMetadata: (chunks) => {
            const proofer = {};
            for (let chunkNumber = 0; chunkNumber < Object.keys(chunks).length; chunkNumber++) {
                const chunk = chunks[chunkNumber];
                const crc32 = this.localCrypto.CRC32Byte(chunk);
                const size = chunk.length;

                proofer[chunkNumber] = {
                    crc32: crc32,
                    size: size
                };
            }
            return proofer;
        },
        initSender: async (chunks, signatures, proofer) => {
            const initialData = {
                proofer: proofer,
                signatures: signatures[5], // пятая группа подписей
                zeroChunk: chunks[0]
            };

            console.log('Sending initial data to server...');
            this.socket.emit('startFileTransfer', initialData);

            // Создаем промис, который будет ждать ответа сервера
            return new Promise((resolve) => {
                this.socket.once('initialDataReceived', (response) => {
                    resolve(response);
                });

                // Таймаут для ответа сервера
                setTimeout(() => {
                    resolve({ status: false, message: 'Server is down.' });
                }, 5000); // 5 секунд ожидания ответа
            });
        },
        FileTransfer: async (chunks, signatures) => {
            const chunkNUmber = Object.keys(chunks).length;
            const chank_success = {};
            for (let i = 0; i < chunkNUmber; i++) {
                this.socket.emit('Protocol', { chunk: chunks[i], sign: signatures[4][i], id: i, level: 4 });
                chank_success[i] = this.SendFileProcessing.Revelidator(i,chunks,signatures);
            }
            // Преобразуем объект chank_success в массив промисов
            const results = await Promise.all(Object.values(chank_success));
            // Проверяем, что все результаты true
            return results.every(value => value === true);
        },
        Revelidator: async (chankID,chunks,signatures) => {
            return new Promise((resolve) => {
                // Ожидаем ответ через сокет
                this.socket.once('Chank' + chankID, async (response) => {

                    let timeout; // Переменная для тайм-аута

                    // Слушаем событие отключения сокета
                    const handleDisconnect = () => {
                        clearTimeout(timeout); // Убираем тайм-аут
                        resolve(false); // Возвращаем false при отключении сокета
                    };
            
                    this.socket.once('disconnect', handleDisconnect);
            
                    // Устанавливаем тайм-аут на случай, если сервер не ответит
                    timeout = setTimeout(() => {
                        this.socket.off('disconnect', handleDisconnect); // Убираем слушатель disconnect
                        resolve(false); // Возвращаем false при тайм-ауте
                    }, 30000); // 30 секунд на выполнение (можно изменить)

                    console.log(response);
                    // Если уровень достигает 0, возвращаем false
                    if (response.level === 0) {
                        resolve(false);
                        return;
                    }
                    // Если статус false, отправляем запрос с уменьшением уровня
                    if (!response.status) {
                        this.socket.emit('Protocol', { 
                            chunk: chunks[chankID], 
                            sign: signatures[response.level - 1][chankID], 
                            id: chankID, 
                            level: response.level - 1 
                        });
                        // Вызываем функцию рекурсивно
                        const result = await this.SendFileProcessing.Revelidator(chankID,chunks,signatures);
                        resolve(result);
                    } else {
                        // Если статус true, возвращаем true
                        resolve(true);
                    }
                });
            });
        },
        FinalReporter: async (finalStatus) => {
            return new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    console.log('Timeout waiting for final response from server');
                    this.socket.off('finalResponse'); // Отменяем прослушивание события, так как время ожидания истекло
                    reject(new Error('Timeout waiting for final response from server'));
                }, 10000); // 10 секунд на получение ответа
        
                // Ожидаем ответа от сервера
                this.socket.once('finalResponse', (response) => {
                    //console.log('Received final response from server:', response);
                    clearTimeout(timeoutId); // Отменяем таймер, так как получен ответ от сервера
                    resolve(response);
                });
        
                // Отправляем итоговый статус передачи файла на сервер
                this.socket.emit('finalStatus', { status: finalStatus});
            });
        }
    }
    
    async getFile (fileID,passwordConfig) {
//        try {
            // Проверяем, активно ли соединение
            if (!this.socket) {     // TODO make a better check
                return { status: false, message: "Socket connection is not active." };
            }

            const header = await this.GetFileProcessing.requestFile(fileID);
            if(!header.status){
                //TODO killswitch for Protocol => false
                return header.message;
            }
            console.log("Our header is ", header)

            // Проверяем, принадлежит ли файл пользователю
            const TestOrigin = await this.GetFileProcessing.CheckIfMine(header.data.key, passwordConfig.toDeleteKey);
            if (!TestOrigin.status) {
                return TestOrigin; // Возвращаем ошибку, если файл не принадлежит пользователю
            }
            console.log("TestOrigin is: ", TestOrigin)

            const RawChanks = await this.GetFileProcessing.GetAllChanks(header.data);
            if (!RawChanks.status) {
                return RawChanks;
            }
            console.log("Raw chunks successfully received:", RawChanks.chunks);







        // }catch (error) {
        //     console.error("Error fetching file:", error);
        //     return { status: false, message: "An error occurred while fetching the file." };
        // }
    }



    GetFileProcessing = {    
        requestFile: (fileID) => {
            return new Promise((resolve) => {
                // Формируем и отправляем запрос на сервер
                this.socket.emit('requestFile', { fileID });
    
                // Слушаем единственный ответ от сервера
                this.socket.once('requestFile', (message) => {
                    console.log("Сообщение от сервера о существовании файла", message);
                    if (message.status) {
                        resolve({ status: true, data: message.data });
                    } else {
                        resolve({ status: false, message: message.message });
                    }
                });
    
                // Таймаут для запроса
                setTimeout(() => {
                    resolve({ status: false, message: "Server looks to be down" });
                }, 10000); // Таймаут 10 секунд
            });
        },
    
        CheckIfMine: async (fileKey, toDeleteKey) => {
            try {
                const derivedKey = await this.localCrypto.Sha256(toDeleteKey);
    
                if (derivedKey === fileKey) {
                    return { status: true, message: "This file belongs to you." };
                } else {
                    return { status: false, message: "This file is not yours..." };
                }
            } catch (error) {
                console.error("Error in CheckIfMine:", error);
                return { status: false, message: "An error occurred during ownership check." };
            }
        },
        
        // Получение всех чанков
        // Клиентский метод для получения чанков
        GetAllChanks: async (headerData) => {
            console.log("Starting GetAllChanks...");

            // Получаем все ключи из headerData, которые являются числами
            const chunkKeys = Object.keys(headerData).filter((key) => !isNaN(Number(key)));
            console.log("Numeric chunk keys:", chunkKeys);

            // Отправляем запрос на сервер для инициализации протокола
            this.socket.emit('Protocol', true);

            // Создаем массив промисов для загрузки чанков
            const chunkPromises = [];
            const retries = {}; // Счетчик попыток для каждого чанка

            for (const key of chunkKeys) {
                const chunkID = parseInt(key, 10); // Преобразуем строковый ключ в число
                retries[chunkID] = 0; // Инициализируем счетчик попыток

                chunkPromises.push(
                    new Promise((resolve) => {
                        const fetchChunk = (attempt) => {
                            console.log(`Requesting chunk ID: ${chunkID}, attempt: ${attempt + 1}`);
                            const timeout = setTimeout(() => {
                                if (retries[chunkID] < 3) {
                                    console.warn(`Timeout for chunk ID ${chunkID}, retrying...`);
                                    retries[chunkID]++;
                                    fetchChunk(attempt + 1); // Повторяем запрос
                                } else {
                                    console.error(`Timeout exceeded for chunk ID ${chunkID} after 3 attempts`);
                                    resolve(null); // Таймаут, превышено количество попыток
                                }
                            }, 10000); // 10 секунд
                        
                            this.socket.emit(`chank${chunkID}`, true); // Запрашиваем чанк
                        
                            this.socket.once(`chank${chunkID}`, (response) => {
                                clearTimeout(timeout); // Очищаем таймаут, так как получили ответ
                        
                                console.log(`Received response for chunk ID ${chunkID}:`, response);
                        
                                if (response.status) {
                                    const isValid = this.localCrypto.CRC32Byte(
                                        new Uint8Array(response.chunk),
                                        response.crc32,
                                        response.size
                                    );
                        
                                    if (isValid) {
                                        console.log(`Chunk ID ${chunkID} passed validation`);
                                        resolve({ id: chunkID, chunk: response.chunk }); // Завершаем промис для успешного чанка
                                    } else {
                                        console.warn(`Chunk ID ${chunkID} failed validation, retrying...`);
                                        if (attempt < 3) {
                                            retries[chunkID]++;
                                            fetchChunk(attempt + 1); // Повторяем запрос только для неуспешного чанка
                                        } else {
                                            console.error(`Failed to retrieve chunk ID ${chunkID} after 3 attempts`);
                                            resolve(null); // Превышено количество попыток
                                        }
                                    }
                                } else {
                                    console.warn(`Server returned error for chunk ID ${chunkID}, retrying...`);
                                    if (attempt < 3) {
                                        retries[chunkID]++;
                                        fetchChunk(attempt + 1); // Повторяем запрос только для неуспешного чанка
                                    } else {
                                        console.error(`Failed to retrieve chunk ID ${chunkID} after 3 attempts`);
                                        resolve(null); // Превышено количество попыток
                                    }
                                }
                            });
                        };
                        
                        fetchChunk(0); // Первая попытка загрузки чанка
                    })
                );
            }

            // Ждем завершения всех промисов
            const chunks = await Promise.all(chunkPromises);

            // Проверяем, есть ли неудачные чанки
            if (chunks.includes(null)) {
                console.error("Failed to retrieve all chunks");
                return { status: false, message: "Failed to retrieve all chunks" };
            }

            console.log("Successfully retrieved all chunks.");
            const orderedChunks = chunks.sort((a, b) => a.id - b.id).map((chunk) => chunk.chunk);
            return { status: true, chunks: orderedChunks };
        },

        CheckSumChank: (chunk, expectedCrc32, expectedSize) => {
            console.log("Validating chunk...");
        
            const calculatedCrc32 = this.localCrypto.CRC32Byte(new Uint8Array(chunk));
            const isSizeValid = chunk.byteLength === expectedSize;
        
            console.log(`CRC32: calculated=${calculatedCrc32}, expected=${expectedCrc32}`);
            console.log(`Size: calculated=${chunk.byteLength}, expected=${expectedSize}`);
        
            return calculatedCrc32 === expectedCrc32 && isSizeValid;
        }
    
        




        }
    };




document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('fileInput').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        const config = { 
            key: "This key should be created by another class and provided to the server",
            serverHost: 'localhost',
            serverPort: 3000,
            MAX_FILE_SIZE: 52428800, //in bytes ))
        };

        const passwordConfig = {
            //here is ths password for encryption
            // this one is generated by Ulda0 generator, I hope
            iv:"fe5dba3ee7832c899c6826955c1d7dd1",
            password:"wzlxMsbekMOSXeFkFvnMdBbMpLKmHPz84XBk5TKyefk=",
            salt:"GRIuiZTDHZAUfwSz+/fsZvPS8uYYmic48OO+fLmyltw=",
            toDeleteKey: "Some origin key that should be saved in origin content file", // this one is responsable for deletion or modification
        }
        
         const processor = new FileProcessor(config);
        // const fileWasSent = await processor.sendFile(file,config.key,passwordConfig);
        // console.log(fileWasSent)

        // // png picture for the test
        const fileWasGet = await processor.getFile('1732462986881',passwordConfig);
        console.log(fileWasGet)

        // // exe file for the test
        // const fileWasGet = await processor.getFile('1732463047705',passwordConfig);
        // console.log(fileWasGet)
    });
});