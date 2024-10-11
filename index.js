const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use('/socket.io', express.static(path.join(__dirname, 'node_modules', 'socket.io', 'client-dist')));

io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id}`);

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
