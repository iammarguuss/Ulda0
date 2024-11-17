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
            this.socket.emit('FirstRequest', firstPackRunner);
    
            // Слушаем ответ на правильное событие
            this.socket.on('FirstResponse', (response) => {
                console.log(response);
                if (response.status && response.end === starting.splitHash[1]) {
                    console.log('Positive response from server:', response);
                    resolve({ success: true, message: 'File sent successfully' });
                } else {
                    console.log('Error response from server:', 'Verification failed');
                    resolve({ success: false, message: 'Error sending file: Verification failed' });
                }
            });
    
            // Тайм-аут
            setTimeout(() => {
                resolve({ success: false, message: 'Timeout: No response from server' });
            }, 3000); // or kill connection
        });
    
        // here we have established our connection to the server
        if(try_connect.success){
            return {status:false,message:try_connect.message}
        }

        ///////////////////// Now lets encrypt the file then))) ///////////////////////

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
        };
        const processor = new FileProcessor(config);
        const fileWasSent = await processor.sendFile(file,config.key);
        //console.log(fileWasSent)
    });
});
