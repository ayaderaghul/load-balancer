const http = require('http')
const {URL} = require('url')

const LB_PORT = 80
const HEALTH_CHECK_PATH = '/'
const HEALTH_CHECK_INTERVAL = 10000 // 10 seconds
const BACKEND_SERVERS = [
    {
        url: 'http://localhost:8080', 
        healthy: true,
        responseTimes: [],
        avgResponseTime: 0
    }, 
    {
        url: 'http://localhost:8081', 
        healthy: true,
        responseTimes: [],
        avgResponseTime: 0
    },
    {
        url: 'http://localhost:8082', 
        healthy: true,
        responseTimes: [],
        avgResponseTime: 0
    }
    ]

function calculateAverage(server) {
    if(server.responseTimes.length === 0) return 0

    const sum = server.responseTimes.reduce((a,b) => a + b, 0)

    server.avgResponseTime = sum / server.responseTimes.length 

    if (server.responseTimes.length > 10) {
        server.responseTimes = server.responseTimes.slice(-10)
    }

    return server.avgResponseTime
}

function getQuickestsServer() {
    const healthyServers = BACKEND_SERVERS.filter(s => s.healthy)

    if (healthyServers.length === 0) return null

    healthyServers.sort((a,b) => a.avgResponseTime - b.avgResponseTime)

    return healthyServers[0]
}

async function checkServerHealth(server) {
    const healthCheckUrl = new URL(HEALTH_CHECK_PATH, server.url)

    return new Promise((resolve) => {
        const options = {
            hostname: healthCheckUrl.hostname,
            port: healthCheckUrl.port,
            path: healthCheckUrl.pathname,
            method: 'GET',
            timeout: 2000
        }

        const req = http.request(options, (res) => {
            res.on('data', () => {})
            res.on('end', () => {
                resolve(res.statusCode === 200)
            })
        })

        req.on('error', () => {
            resolve(false)
        })

        req.on('timeout', () => {
            req.destroy()
            resolve(false)

        })
        req.end()
    })
}

async function performHealthChecks() {
    console.log('Performing health checks...')

    for (const server of BACKEND_SERVERS) {
        const isHealthy = await checkServerHealth(server)
        server.healthy = isHealthy
        console.log(`Server ${server.url} is ${isHealthy ? 'healthy' : 'unhealthy'}`)
    }

    setTimeout(performHealthChecks, HEALTH_CHECK_INTERVAL)
}

setTimeout(performHealthChecks, HEALTH_CHECK_INTERVAL)

// round robin
function getNextHealthyServer() {
    const initialIndex = currentServerIndex
    let attempts = 0

    do {
        const server = BACKEND_SERVERS[currentServerIndex]
        currentServerIndex = (currentServerIndex + 1) % BACKEND_SERVERS.length
    
        if (server.healthy) {
            return server
        }

        attempts++
    } while (attempts < BACKEND_SERVERS.length)

    return null
}


const server = http.createServer(async (clientReq, clientRes) => {
    
    console.log(`\nNew request: ${clientReq.method} ${clientReq.url}`)
    
    const server = getQuickestsServer()    

    if (!server) {
        clientRes.writeHead(503)
        clientRes.end('No healthy backend servers available')
        return
    }

    console.log(`Selected server: ${server.url} (Avg RT: ${server.avgResponseTime.toFixed(2)} ms`)

    try {
        const backendUrl = new URL(clientReq.url, server.url)
        const startTime = Date.now()
        
        const options = {
            hostname: backendUrl.hostname,
            port: backendUrl.port,
            path: backendUrl.pathname,
            method: clientReq.method,
            headers: { ...clientReq.headers,
                'x-forwarded-for': clientReq.socket.remoteAddress
            }
        }

        const proxyReq = http.request(options, (proxyRes) => {
            const responseTime = Date.now() - startTime
            server.responseTimes.push(responseTime)
            calculateAverage(server)
                    
            
            console.log(`Response from server ${server.url}: HTTP/${proxyRes.statusCode} (${responseTime}ms)`)
        

            clientRes.writeHead(proxyRes.statusCode, proxyRes.headers)

            proxyRes.pipe(clientRes, {end:true})
        })

        proxyReq.on('error', (err) => {
            console.error('Proxy request error:', err)
            clientRes.writeHead(500)
            clientRes.end('Internal server error')
        })

        clientReq.pipe(proxyReq, {end:true})
    } catch(err) {
        console.error('Error', err.message)
        if (!clientRes.headersSent) {
            clientRes.writeHead(500)
            clientRes.end('internal server error')
        }
    }
})

server.listen(LB_PORT, () => {
    console.log(`Load balacner running on port ${LB_PORT}`)
    console.log(`Backend servers:`)
    BACKEND_SERVERS.forEach(s=>console.log(`- ${s.url}`))
    console.log('using weighted response time algorithm')
})