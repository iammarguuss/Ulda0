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

//=====================================OLD BUT WORKING OPTION=================================
// async function generateLinkedHashes(line) {
//     let newLine = {...line}; // Создаем копию объекта для безопасной модификации
//     const firstKey = parseInt(Object.keys(newLine)[0]);
//     const lastKey = firstKey + 6;

//     for (let i = firstKey; i <= lastKey; i++) {
//         if (newLine[i] !== undefined) { // Убедимся, что ключ существует перед хешированием
//             for (let j = firstKey + 1; j <= i; j++) {
//                 newLine[i] = await hashSHA256(newLine[i]);  // Применяем хеширование
//             }
//         }
//     }

//     return newLine;
// }

async function generateLinkedHashes(line,start = null,end = null) {
    if(!start){
        start = Math.min(...Object.keys(line))
    }
    if(!end){
        end = start + 5
    }
    const depth = end-start+1
    let chain = {}
    chain[0] = {...line};
    for (let d = 1; d < depth; d++) {
        chain[d] = {}
        for (let n = d+start; n <= end; n++) {
            //chain[d][n] = sha(chain[d-1][n-1]+chain[d-1][n])
            chain[d][n] = await hashSHA256(chain[d-1][n-1]+chain[d-1][n])
        }
    }
    let after = {}
    for (let i = 0; i < depth; i++) {
        after[start+i] = chain[i][Math.min(...Object.keys(chain[i]))]
    }
    return after;
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
// async function validateHashChain(oldHashes, newHashes) {
//     const oldKeys = Object.keys(oldHashes).map(Number).sort((a, b) => a - b);
//     const newKeys = Object.keys(newHashes).map(Number).sort((a, b) => a - b);

//     if (oldKeys.length < 2 || newKeys.length < 2) {
//         console.log("Not enough hashes to validate.");
//         return false;
//     }

//     let allValid = true;
//     for (let i = 1; i < oldKeys.length; i++) {  //TODO adjust here :)
//         const oldKey = oldKeys[i];
//         const newKey = newKeys[i - 1]; // Сравниваем старый хеш с хешем, сгенерированным из предыдущего нового хеша

//         if (!oldHashes.hasOwnProperty(oldKey) || !newHashes.hasOwnProperty(newKey)) {
//             console.log(`Missing hash for old key ${oldKey} or new key ${newKey}`);
//             allValid = false;
//             continue;
//         }

//         const expectedOldHash = oldHashes[oldKey];
//         const previousNewHash = newHashes[newKey];

//         // Генерация ожидаемого хеша из предыдущего нового хеша
//         const calculatedHash = await hashSHA256(previousNewHash);

//         if (calculatedHash !== expectedOldHash) {
//             console.log(`Mismatch at key ${oldKey}: expected ${expectedOldHash}, got ${calculatedHash}`);
//             allValid = false;
//         }
//     }

//     if (allValid) {
//         console.log("Validation successful: All hashes in oldHashes are valid successors of newHashes.");
//     } else {
//         console.log("Validation failed: Some hashes in oldHashes are not valid successors.");
//     }

//     return allValid;
// }

async function validateHashChain(arg1,arg2,start1 = null,end1 = null) {
    let allValid = true;
    if(!start1){start1 = Math.min(...Object.keys(arg1))}
    if(!end1){end1 = start1 + 4}

    // const leverage = end1-start1;
    for (let i = start1; i < end1; i++) {
        let a = arg1[i+1]
        let b = await hashSHA256(arg1[i]+arg2[i+1])   
        
        if(a !== b){allValid = false
             console.log("bbbbbbbbbbbbbb ", a, b)
        }
         console.log("AAAAAAAA AT " + i + " ", a, b)
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


//Проверка пароля
async function passcheck(password) {
    // Переводим пароль в Uint8Array
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    // Генерация соли
    const salt = crypto.getRandomValues(new Uint8Array(16));

    // Создаем PBKDF2-хэш с использованием SHA-256
    const keyMaterial = await crypto.subtle.importKey("raw", passwordBuffer, "PBKDF2", false, ["deriveBits"]);
    const saltypass = await crypto.subtle.deriveBits({
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256"
    }, keyMaterial, 256); // Получаем 256 бит

    // Переводим результат в hex-строку
    const saltypassHex = Array.from(new Uint8Array(saltypass)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Расчет энтропии (простейшая имитация)
    let entropy = password.length * 6; // Предположим, что каждый символ добавляет 6 бит энтропии

    // Хэширование оригинального пароля с использованием SHA-512
    const idBuffer = await crypto.subtle.digest("SHA-512", passwordBuffer);
    const idHex = Array.from(new Uint8Array(idBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    const id = idHex.substring(0, 16); // Первые 16 символов

    // Хэширование saltypass с использованием SHA-512
    const skeyBuffer = await crypto.subtle.digest("SHA-512", new Uint8Array(saltypass));
    const skeyHex = Array.from(new Uint8Array(skeyBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    const skey = skeyHex.substring(0, 16); // Первые 16 символов

    return {
        Entropy: entropy,
        idLess: entropy > 200,
        saltypass: saltypassHex,
        salt: Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join(''),
        id: id,
        skey: skey
    };
}




































//////////////////////////////////New encryption methods//////////////////////////////////
async function GenerateNewPassForContentFile() {
    const arrayBufferToBase64 = (buffer) => {
        return btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)));
      };
    
      const arrayBufferToHex = (buffer) => {
        return Array.from(new Uint8Array(buffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      };
    
      // Генерация пароля
      const passwordBuffer = crypto.getRandomValues(new Uint8Array(32)); // 24 байта = 32 символа в base64
      const password = arrayBufferToBase64(passwordBuffer);
    
      // Генерация IV
      const ivBuffer = crypto.getRandomValues(new Uint8Array(16)); // 12 байт для IV
      const iv = arrayBufferToHex(ivBuffer);
    
      // Генерация соли
      const saltBuffer = crypto.getRandomValues(new Uint8Array(32)); // 24 байта = 32 символа в base64
      const salt = arrayBufferToBase64(saltBuffer);
    
      return {
        password,
        iv,
        salt
      };
       
}

async function newEncContentFile(file,passwordSettings) {
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
}

async function newDecContentFile(encryptedData, passwordSettings) {
    const { password, iv, salt } = passwordSettings;

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
  
    // Преобразование пароля в ключ (обеспечение нужной длины 256 бит)
    const passwordBytes = encoder.encode(password).slice(0, 32);
    const key = await crypto.subtle.importKey(
      "raw",
      passwordBytes, // Теперь пароль точно 256 бит
      { name: "AES-CBC" },
      false,
      ["decrypt"]
    );
  
    const ivArray = new Uint8Array(iv.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  
    // Расшифровка данных
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: "AES-CBC",
        iv: ivArray
      },
      key,
      encryptedData
    );
  
    const decryptedBytes = new Uint8Array(decryptedData);
    const saltBytes = encoder.encode(salt);
    const saltedData = new Uint8Array(decryptedBytes.length);
  
    // Применение операции XOR к расшифрованным данным
    for (let i = 0; i < decryptedBytes.length; i++) {
      saltedData[i] = decryptedBytes[i] ^ saltBytes[i % saltBytes.length];
    }
  
    // Удаление 32 случайных байт из начала данных после XOR
    const originalData = saltedData.slice(32);
  
    // Преобразование данных обратно в строку
    const jsonString = decoder.decode(originalData);
  
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.error("Failed to parse JSON:", jsonString);
      throw error; // Переброс ошибки дальше
    }
}
