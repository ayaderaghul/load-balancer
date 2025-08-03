const http = require('http')

const server = http.createServer((req,res) => {
    console.log(`Received request from ${req.socket.remoteAddress}`)
    console.log(`${req.method} ${req.url} HTTP/${req.httpVersion}`)
    console.log(`Host: ${req.headers.host}`)
    console.log(`User-Agent: ${req.headers['user-agent']}`)
    console.log(`Accept: ${req.headers.accept}`)

    res.writeHead(200, {'Content-Type': 'text/plain'})
    res.end('Hello from backend server 2\n')
    
    console.log('replied with a hello message')
})

const PORT = 8081
server.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`)
})