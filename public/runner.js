const u = new ulda0;

console.log(u);

//Pulse sample 
u.pulse(latency => {
    if (latency === null) {
        console.log('Response time exceeded 5 seconds, latency is null.');
    } else {
        console.log(`Latency: ${latency} ms`);
    }
});

//We registered file!
u.MainFileRegister('secretPassword', (response) => {
        console.log('We have registered, I think : ', response);
});


// GetFile
u.GetFile(23, "secretPassword", (data, error) => {
    console.log("We got the file and what we got : ", data);
});