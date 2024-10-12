const u = new ulda;

console.log(u);

//Pulse sample 
u.pulse(latency => {
    if (latency === null) {
        console.log('Response time exceeded 5 seconds, latency is null.');
    } else {
        console.log(`Latency: ${latency} ms`);
    }
});

u.MainFileRegister('secretPassword', (response) => {
        console.log('We have registered, I think : ', response);
});