// Структура MasterFile
const MasterFile = {
    signatures: {},  // Подписи для изменения самого мастерфайла
    files: {}        // Содержит информацию о файлах: { fileID: { key, index }, ... }
};

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