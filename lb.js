const http = require('http');
const { URL } = require('url');

// Configuration
const LB_PORT = 80;
const HEALTH_CHECK_PATH = '/';
const HEALTH_CHECK_INTERVAL = 10000; // 10 seconds

// Backend servers with initial health status
const BACKEND_SERVERS = [
  { url: 'http://localhost:8080', healthy: true },
  { url: 'http://localhost:8081', healthy: true },
  { url: 'http://localhost:8082', healthy: true }
];

let currentServerIndex = 0;

// Function to perform health check
async function checkServerHealth(server) {
  const healthCheckUrl = new URL(HEALTH_CHECK_PATH, server.url);
  
  return new Promise((resolve) => {
    const options = {
      hostname: healthCheckUrl.hostname,
      port: healthCheckUrl.port,
      path: healthCheckUrl.pathname,
      method: 'GET',
      timeout: 2000
    };
    
    const req = http.request(options, (res) => {
      res.on('data', () => {}); // Consume data but don't need it
      res.on('end', () => {
        resolve(res.statusCode === 200);
      });
    });
    
    req.on('error', () => {
      resolve(false);
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

// Periodic health check
async function performHealthChecks() {
  console.log('Performing health checks...');
  
  for (const server of BACKEND_SERVERS) {
    const isHealthy = await checkServerHealth(server);
    server.healthy = isHealthy;
    console.log(`Server ${server.url} is ${isHealthy ? 'healthy' : 'unhealthy'}`);
  }
  
  setTimeout(performHealthChecks, HEALTH_CHECK_INTERVAL);
}

// Start health checks
setTimeout(performHealthChecks, HEALTH_CHECK_INTERVAL);

// Get next healthy server using round-robin
function getNextHealthyServer() {
  const initialIndex = currentServerIndex;
  let attempts = 0;
  
  do {
    const server = BACKEND_SERVERS[currentServerIndex];
    currentServerIndex = (currentServerIndex + 1) % BACKEND_SERVERS.length;
    
    if (server.healthy) {
      return server;
    }
    
    attempts++;
  } while (attempts < BACKEND_SERVERS.length);
  
  return null; // No healthy servers available
}

// Create the load balancer server
const server = http.createServer(async (clientReq, clientRes) => {
  console.log(`Received request from ${clientReq.socket.remoteAddress}`);
  console.log(`${clientReq.method} ${clientReq.url} HTTP/${clientReq.httpVersion}`);
  console.log(`Host: ${clientReq.headers.host}`);
  console.log(`User-Agent: ${clientReq.headers['user-agent']}`);
  console.log(`Accept: ${clientReq.headers.accept}`);
  
  // Get the next healthy backend server
  const server = getNextHealthyServer();
  
  if (!server) {
    clientRes.writeHead(503);
    clientRes.end('No healthy backend servers available');
    return;
  }
  
  try {
    // Parse the backend URL
    const backendUrl = new URL(clientReq.url, server.url);
    
    // Options for the proxy request
    const options = {
      hostname: backendUrl.hostname,
      port: backendUrl.port,
      path: backendUrl.pathname,
      method: clientReq.method,
      headers: clientReq.headers
    };
    
    // Make the request to the backend server
    const proxyReq = http.request(options, (proxyRes) => {
      console.log(`Response from server ${server.url}: HTTP/${proxyRes.httpVersion} ${proxyRes.statusCode} ${proxyRes.statusMessage}`);
      
      // Forward the status code and headers
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      
      // Pipe the response from backend to client
      proxyRes.pipe(clientRes, { end: true });
    });
    
    // Handle errors
    proxyReq.on('error', (err) => {
      console.error('Proxy request error:', err);
      clientRes.writeHead(502);
      clientRes.end('Bad Gateway');
    });
    
    // Pipe the client request to the backend server
    clientReq.pipe(proxyReq, { end: true });
    
  } catch (err) {
    console.error('Error:', err);
    clientRes.writeHead(500);
    clientRes.end('Internal Server Error');
  }
});

server.listen(LB_PORT, () => {
  console.log(`Load balancer running on port ${LB_PORT}`);
  console.log(`Backend servers: ${BACKEND_SERVERS.map(s => s.url).join(', ')}`);
  console.log(`Health checks every ${HEALTH_CHECK_INTERVAL/1000} seconds`);
});