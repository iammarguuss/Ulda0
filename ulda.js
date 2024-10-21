// Функция для генерации подписей
async function generateSignatures(signatureCount) {
    const signatures = [];
    for (let i = 0; i < signatureCount; i++) {
        const array = new Uint8Array(33);
        window.crypto.getRandomValues(array);
        const base64String = btoa(String.fromCharCode.apply(null, array));
        signatures.push(base64String);
    }
    return signatures;
}

// Функция для обновления подписей в MasterFile
async function createMasterFileSignatures() {
    const newSignatures = await generateSignatures(5);
    MasterFile.signatures = newSignatures.reduce((acc, signature, index) => {
        acc[index] = signature;  // Начало нумерации с 0
        return acc;
    }, {});
//    console.log('Created MasterFile with new signatures:', MasterFile);
}

// Функция для обновления подписей, удаляя старую и добавляя новую
async function StepUpSignaturesUpdate() {
    const minId = Math.min(...Object.keys(MasterFile.signatures).map(Number));
    // Удаление подписи с индексом 0
    delete MasterFile.signatures[minId];

    // Генерация новой подписи и добавление её с индексом 10
    const newSignature = await generateSignatures(1);
    MasterFile.signatures[minId+5] = newSignature[0];

//    console.log('Updated MasterFile with stepped up signatures:', MasterFile);
}

async function generateLinkedHashes(line) {
    let newLine = {...line}; // Создаем копию объекта для безопасной модификации
    const firstKey = parseInt(Object.keys(newLine)[0]);
    const lastKey = firstKey + 6;

    for (let i = firstKey; i <= lastKey; i++) {
        if (newLine[i] !== undefined) { // Убедимся, что ключ существует перед хешированием
            for (let j = firstKey + 1; j <= i; j++) {
                newLine[i] = await hashSHA256(newLine[i]);  // Применяем хеширование
            }
        }
    }

    return newLine;
}

async function hashSHA256(data) {
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encodedData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////
async function validateHashChain(oldHashes, newHashes) {
    const oldKeys = Object.keys(oldHashes).map(Number).sort((a, b) => a - b);
    const newKeys = Object.keys(newHashes).map(Number).sort((a, b) => a - b);

    if (oldKeys.length < 2 || newKeys.length < 2) {
        console.log("Not enough hashes to validate.");
        return false;
    }

    let allValid = true;
    for (let i = 1; i < oldKeys.length; i++) {  //TODO adjust here :)
        const oldKey = oldKeys[i];
        const newKey = newKeys[i - 1]; // Сравниваем старый хеш с хешем, сгенерированным из предыдущего нового хеша

        if (!oldHashes.hasOwnProperty(oldKey) || !newHashes.hasOwnProperty(newKey)) {
            console.log(`Missing hash for old key ${oldKey} or new key ${newKey}`);
            allValid = false;
            continue;
        }

        const expectedOldHash = oldHashes[oldKey];
        const previousNewHash = newHashes[newKey];

        // Генерация ожидаемого хеша из предыдущего нового хеша
        const calculatedHash = await hashSHA256(previousNewHash);

        if (calculatedHash !== expectedOldHash) {
            console.log(`Mismatch at key ${oldKey}: expected ${expectedOldHash}, got ${calculatedHash}`);
            allValid = false;
        }
    }

    if (allValid) {
        console.log("Validation successful: All hashes in oldHashes are valid successors of newHashes.");
    } else {
        console.log("Validation failed: Some hashes in oldHashes are not valid successors.");
    }

    return allValid;
}

////////////////////////////////////////////////////////////////////

async function encryptFile(fileData, password, salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iterations = 100000, pbkdf2Salt = crypto.getRandomValues(new Uint8Array(16))) {
    fileData = JSON.stringify(fileData)
    const encoder = new TextEncoder();
    
    // Преобразуем пароль в ключ, используя PBKDF2
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveKey"]
    );

    // Параметры для PBKDF2
    const keyDeriveParams = {
        name: "PBKDF2",
        salt: pbkdf2Salt,
        iterations: iterations,
        hash: "SHA-256"
    };

    // Создание ключа для AES-GCM
    const key = await crypto.subtle.deriveKey(
        keyDeriveParams,
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"]
    );

    // Шифрование файла
    const encryptedData = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encoder.encode(fileData)
    );

    // Формируем результат
    const result = {
        encryptedData: encryptedData, // Зашифрованные данные как ArrayBuffer
        params: {
            iterations: iterations,
            salt: Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join(''),
            iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
            pbkdf2Salt: Array.from(pbkdf2Salt).map(b => b.toString(16).padStart(2, '0')).join('')
        }
    };

    // Возвращаем объект с ArrayBuffer и параметрами в JSON
    return result;
}

async function decryptFile(encryptedFile, password) {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    // Разбор JSON с зашифрованными данными и параметрами
    const { encryptedData, params } = encryptedFile;

    // Преобразуем параметры обратно из шестнадцатеричной строки в байты
    const iv = new Uint8Array(params.iv.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const salt = new Uint8Array(params.salt.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const pbkdf2Salt = new Uint8Array(params.pbkdf2Salt.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

    // Импортируем пароль как ключ для PBKDF2
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveKey"]
    );

    // Деривация ключа AES-GCM из пароля
    const key = await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: pbkdf2Salt,
            iterations: params.iterations,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
    );

    // Расшифровка данных
    const decryptedData = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encryptedData
    );

    return JSON.parse(decoder.decode(decryptedData));
}

async function encryptContentFile(fileData, password, iv = crypto.getRandomValues(new Uint8Array(12))) {
    const encoder = new TextEncoder();

    // Генерация хеша SHA-256 из пароля
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password));
    const keyBuffer = hashBuffer.slice(0, 32); // Обрезаем до 256 бит, если нужно

    // Импорт ключа из хеша для AES-GCM
    const key = await crypto.subtle.importKey(
        "raw",
        keyBuffer,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"]
    );

    // Шифрование файла
    const encryptedData = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encoder.encode(JSON.stringify(fileData))
    );

    return {
        encryptedData: encryptedData,
        iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('')
    };
}

async function decryptContentFile(encryptedFile, password) {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    // Преобразование IV обратно в тип Uint8Array
    const iv = new Uint8Array(encryptedFile.iv.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

    // Генерация хеша SHA-256 из пароля для получения ключа
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password));
    const keyBuffer = hashBuffer.slice(0, 32); // Обрезаем до 256 бит

    // Импорт ключа для AES-GCM
    const key = await crypto.subtle.importKey(
        "raw",
        keyBuffer,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
    );

    // Расшифровка данных
    try {
        const decryptedData = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            key,
            encryptedFile.encryptedData
        );
        return JSON.parse(decoder.decode(decryptedData)); // Возвращаем расшифрованные данные как строку
    } catch (e) {
        console.error("Decryption failed:", e);
        return null; // В случае ошибки возвращаем null
    }
}
