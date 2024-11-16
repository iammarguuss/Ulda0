class FileProcessor {
    constructor(config) {
        this.config = config;
    }


}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('fileInput').addEventListener('change', (event) => {
        const file = event.target.files[0];
        const config = { key: "value" }; // Пример конфигурации
        const processor = new FileProcessor(config,file);
    });
});
