function hashSHA256(data) {
    const hash = CryptoJS.SHA256(data);
    //return hash.toString(CryptoJS.enc.Hex);
    return hash.toString(CryptoJS.enc.Hex);
}

const MasterFile = {
    signatures: {
        0:"+WHyou3jt8PJlNPdxegLYOlzxLMdrCvaFO6ZKO/LoF38",
        1:"7hnEJkE2ToPEFdTs64aS6od8nN9JSEfQQOZ4N+PnFos9",
        2:"QksKAEWIe5BNn6VyplQjzZebSPm+CgrZg3EMZ+cCpcws",
        3:"0SMykndmrltOpHP4Jd4ibYrQypTz0blvfBnfxH97Xft9",
        4:"BrRlxTnI6I0QCAwKi5nj5Sa9+CLm8j0m6UwXgrQ/3Q4l",
        5:"HpwYJK2G5MWnrikJixa6Pv4urU4PGkS1OEtfY9YojJ/a",
        6:"de+6sW7SfSIHEDIWdBYWwmwkg/XmDMKFj+pKz5EDv372",
        7:"7tFPPdSYeuoW+E6UQV2vocFfLgV80SDxZ4rItP2aKJKX",
        8:"8L4dPEAhGVQY0YBzPb9oR8D4KOEtJJ2ygADaC5Im3Rf9",
        9:"5Z/hYgMZC34IakmJvkWhSoD+Nynh7/rtqYymcOpjHMRd",
    },  // Подписи для изменения самого мастерфайла
    files: {}        // Содержит информацию о файлах: { fileID: { key, index }, ... }
};

// Функция для генерации подписей
function generateSignatures(signatureCount) {
    const signatures = [];
    for (let i = 0; i < signatureCount; i++) {
        const array = CryptoJS.lib.WordArray.random(33);
        const base64String = CryptoJS.enc.Base64.stringify(array);
        signatures.push(base64String);
    }
    return signatures;
}

// Функция для обновления подписей в MasterFile
function createMasterFileSignatures() {
    const newSignatures = generateSignatures(10);
    MasterFile.signatures = newSignatures.reduce((acc, signature, index) => {
        acc[index] = signature;  // Начало нумерации с 0
        return acc;
    }, {});
//    console.log('Created MasterFile with new signatures:', MasterFile);
}

// Функция для обновления подписей, удаляя старую и добавляя новую
function StepUpSignaturesUpdate() {
    const minId = Math.min(...Object.keys(MasterFile.signatures).map(Number));
    // Удаление подписи с индексом 0
    delete MasterFile.signatures[minId];

    // Генерация новой подписи и добавление её с индексом 10
    const newSignature = generateSignatures(1);
    MasterFile.signatures[minId+10] = newSignature[0];

//    console.log('Updated MasterFile with stepped up signatures:', MasterFile);
}

// function generateLinkedHashes(lime) {
//     let line = lime; // I am not a developer
//     const firstKey = parseInt(Object.keys(line)[0])

//     for (let i = firstKey+1; i <= firstKey+6; i++) {
//         for (let j = firstKey+1; j < i; j++) {
//             line[i] = hashSHA256(line[i-1]+line[i]);
//             console.log(i + "" + (j))        
//         }
//     }

//     return line;
// }

function generateLinkedHashes(lime) {
    let line = lime; // I am not a developer
    const firstKey = parseInt(Object.keys(line)[0])
    const lastKey = firstKey + 6
    console.log("We are from " + firstKey + " and " + lastKey)
    
    for (let i = firstKey; i < lastKey; i++) {
        for (let j = firstKey+1; j <= i; j++) {
                console.log(Object.keys(line)[i])
                line[i] = hashSHA256(line[i]);  // Применяем хеширование
        }
    }

    return line;
}

function LinkedHashesTest(Old, New) {
    console.log(Old,New)
    console.log(Old[1])
    console.log(hashSHA256(New[1]))
    console.log('\n')
    console.log(Old[2])
    console.log(hashSHA256(New[2]))
    console.log('\n')
    console.log(Old[3])
    console.log(hashSHA256(New[3]))
}
