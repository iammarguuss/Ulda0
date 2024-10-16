
# Ulda0 Test project

This is very first version/test of the Ulda protocol

u.pulse(latency => {}) => check latency

u.MainFileRegister('secretPassword', (response) => {}) => register Main File

u.GetFile(58, "secretPassword", (data, error) => {})
After that => u.MainFile should contain main file data
