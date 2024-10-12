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
    ssl: {
        rejectUnauthorized: false
    }
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


    socket.on('CanIRegister', (data, callback) => {   // ask to register
        console.log(`Received CanIRegister from ${socket.id}`);
        callback(true);
    });

    socket.on('RegisterFile', (data, callback) => {
        console.log(`Received RegisterFile from ${socket.id}`);
                                                                    // TODO actually register file
        callback({ code: 200 });                                    // TODO change it here
    });



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
