const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const { Pool } = require('pg'); 
require('dotenv').config();      

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Error executing query', err.stack);
    } else {
        console.log('Connection to PostgreSQL established:', res.rows[0].now); 
    } 
});
 
app.use(express.static('public')); 
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use('/socket.io', express.static(path.join(__dirname, 'node_modules', 'socket.io', 'client-dist')));

io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id}`);

    // Just make sure that server is working
    socket.on('CanIRegister', (data, callback) => {   // ask to register
        console.log(`Received CanIRegister from ${socket.id}`);
        callback(true);
    });

    //Recive and save file to data base and give responce
    socket.on('RegisterFile', async (data, callback) => {
        console.log(`Received RegisterFile from ${socket.id}`);
        try {
            // Подготовка SQL-запроса для вставки данных в базу
            const insertQuery = 'INSERT INTO master_files (content, signchain, itter) VALUES ($1, $2, $3) RETURNING id;';
            const values = [data.encryptedFile, data.signatures, 0]; // iteration начинаем с 0
    
            // Выполнение запроса к базе данных
            const res = await pool.query(insertQuery, values);
    
            // Возвращаем ID новой записи клиенту
            callback({ id: res.rows[0].id });
        } catch (error) {
            console.error('Error saving file:', error);
            callback({ error: 'Error saving file' });
        }
    });

    socket.on('RequestFile', async (data, callback) => {
        try {
            const { id } = data;
            const query = 'SELECT * FROM master_files WHERE id = $1';
            const { rows } = await pool.query(query, [id]);

            if (rows.length > 0) {
                const fileData = rows[0];
                callback({ data: fileData });  // Отправляем данные файла обратно клиенту
            } else {
                callback({ error: 'File not found' });
            }
        } catch (error) {
            console.error('Error retrieving file:', error);
            callback({ error: 'Error retrieving file' });
        }
    });

    // pulse
    socket.on('ping', () => {
        socket.emit('pong', Date.now());
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});

server.listen(5555, () => {
    console.log('Server is up and listening to port 5555');
});
