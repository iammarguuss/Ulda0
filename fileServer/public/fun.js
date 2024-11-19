class FileProcessor {
    constructor(config) {
        this.config = config;
        this.socket = io({
            host: config.serverHost,
            port: config.serverPort,
            // Дополнительная конфигурация, если нужна
        });
    }

    async sendFile(file, key, passworgConfig) {
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
        chunks[0] = await this.localCrypto.newEncContentFile(chunks[0],passworgConfig)
        console.log(chunks[0])

        const proofer = await this.SendFileProcessing.saveChunkMetadata(chunks)
        console.log(proofer)

        //return try_connect;
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
    
    };

}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('fileInput').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        const config = { 
            key: "This key should be created by another class and provided to the server",
            serverHost: 'localhost',
            serverPort: 3000,
            MAX_FILE_SIZE: 52428800, //in bytes ))

            //here is ths password for encryption
            iv:"fe5dba3ee7832c899c6826955c1d7dd1",
            password:"wzlxMsbekMOSXeFkFvnMdBbMpLKmHPz84XBk5TKyefk=",
            salt:"GRIuiZTDHZAUfwSz+/fsZvPS8uYYmic48OO+fLmyltw="
        };


        
        const processor = new FileProcessor(config);
        const fileWasSent = await processor.sendFile(file,config.key,{iv:config.iv,password:config.password,salt:config.salt});
        console.log(fileWasSent)
    });
});




