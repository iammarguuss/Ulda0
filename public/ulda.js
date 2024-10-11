class ulda {
    settings = {
        host:'http://localhost:5555',
    }

    constructor() {
        this.connection = {
            status: false,
        };
        
        this.socket = io.connect(this.settings.host);

        this.socket.on('connect', () => {
            this.connection.status = true;
            console.log('Connection status:', this.connection.status);
        });

        this.socket.on('disconnect', () => {
            this.connection.status = false;
            console.log('Connection status:', this.connection.status);
        });
    }
    
    pulse(callback) {
        const startTime = Date.now();
        this.socket.emit('ping');

        this.socket.once('pong', (serverTime) => {
            const latency = Date.now() - startTime;
            if (latency > 5000) {
                callback(null); // Return null if the response time exceeds 5 seconds
            } else {
                callback(latency); // Otherwise, return the latency in milliseconds
            }
        });
    }


}


// The pulse method is called with a callback function that handles the response.
// This callback logs the latency if it's less than 5 seconds, or logs 'null' if it exceeds that time.
