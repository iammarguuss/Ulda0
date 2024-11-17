class FileProcessor {
    constructor(config) {
        this.config = config;
        this.socket = io({
            host: config.serverHost,
            port: config.serverPort,
            // Дополнительная конфигурация, если нужна
        });
    }

    async sendFile(file, key) {
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

        if(this.config.MAX_FILE_SIZE < fileMeta.Meta.size){
            return {status:false,message:"File is just too big :("}
        }

        const chunks = this.SendFileProcessing.fileSplitter(file);
        console.log("Chanks are splitted in ",chunks)


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
        fileSplitter: (file) => {
            const CHUNK_SIZE = 256 * 1024; // 256 КБ в байтах
            let chunks = {};
            let currentChunk = 1;
    
            for (let start = 0; start < file.size; start += CHUNK_SIZE) {
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const blob = file.slice(start, end); // Получаем часть файла как Blob
                const reader = new FileReader();
                // Это асинхронная операция, поэтому используем Promise для обработки
                const promise = new Promise((resolve) => {
                    reader.onload = function() {
                        // Сохраняем содержимое чанка в виде байтового массива
                        chunks[currentChunk] = new Uint8Array(this.result);
                        resolve();
                    };
                    reader.readAsArrayBuffer(blob);
                });
                // Дожидаемся завершения чтения данного чанка перед переходом к следующему
                promise.then(() => {
                    currentChunk++;
                });
            }
            return chunks; // Возвращаем объект с чанками
        }
    
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
        };
        const processor = new FileProcessor(config);
        const fileWasSent = await processor.sendFile(file,config.key);
        console.log(fileWasSent)
    });
});
