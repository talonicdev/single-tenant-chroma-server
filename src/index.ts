import http, { IncomingMessage, ServerResponse } from 'node:http';
import httpProxy from 'http-proxy';
import { spawn, ChildProcess } from 'child_process';
import portfinder from 'portfinder';
import axios from 'axios';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import YAML from 'yaml';
import fs from 'fs';
import { UUID, ServerOptionsArgs, ChromaDbInstance, ChromaDbInstancesMap, validationDto, ServerOptionsYml } from './types.d';
import Server from 'http-proxy';
import 'dotenv/config';
import consoleStamp from 'console-stamp';

// Add timestamps to console logs
consoleStamp(console, { format: ':date(yyyy/mm/dd HH:MM:ss.l)' });

// Parse command-line arguments, if any
const argv:ServerOptionsArgs = yargs(hideBin(process.argv))
    .options({
        port: { type: 'number', demandOption: false, alias: 'p' },
        authServerEndpoint: { type: 'string', demandOption: false, alias: 'auth' },
        authServerAPIKey: { type: 'string', demandOption: false, alias: 'authKey' },
        dbPath: { type: 'string', demandOption: false, alias: 'db' },
        dbTTL: { type: 'number', demandOption: false, alias: 'ttl' },
    })
    .parseSync();

// Parse config.yaml, if any
let yamlConfig:ServerOptionsYml = {};
let configFile:string = '';
try {
    configFile = fs.readFileSync('./config.yml', 'utf8');
} catch(error) {
}

if (configFile) {
    try {
        yamlConfig = YAML.parse(fs.readFileSync('./config.yml', 'utf8'));
    } catch(error) {
        console.error('config.yml found, but invalid.',error);
        throw new Error('config.yml invalid.');
    }
}

// Populate settings from args, config file, env or defaults
const APP_PORT: number          = argv.port || yamlConfig.appPort || parseInt(process.env.APP_PORT || "8080");
const AUTH_SERVER_URL: string   = argv.authServerEndpoint || yamlConfig.authServerEndpoint || process.env.AUTH_SERVER_ENDPOINT || "";
const AUTH_SERVER_KEY: string   = argv.authServerAPIKey || yamlConfig.authServerAPIKey || process.env.AUTH_SERVER_APIKEY || "";
const DB_PATH: string           = argv.dbPath || yamlConfig.dbPath || process.env.DB_PATH || "./chromadb";
const DB_TTL: number     = argv.dbTTL || yamlConfig.dbTTL || parseInt(process.env.DB_TTL || "180000");

// Initialize proxy server and ChromaDB instances map
const proxy:Server = httpProxy.createProxyServer({});
const chromaDbInstances: ChromaDbInstancesMap = {};

console.log(`Config: Port ${APP_PORT}, Auth Server URL: ${AUTH_SERVER_URL}, DB Path: ${DB_PATH}, ChromaDB TTL: ${DB_TTL}.`);

async function startChromaDbInstance(userId: UUID): Promise<number> {
    try {
        
        const port: number = await portfinder.getPortPromise(); // get any available port
        const dbPath: string = `${DB_PATH}/${userId}`;

        // start ChromaDB CLI for the given user
        const chromaProcess: ChildProcess = spawn('chroma', ['run', '--host', '127.0.0.1', '--path', dbPath, '--port', String(port)], {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        // terminate any user instances if a request somehow made it past the previous check
        terminateInstance(userId);

        // add new instance to the map
        chromaDbInstances[userId] = {
            port,
            lastActive: Date.now(),
            process: chromaProcess
        };

        console.log(`Launching ChromaDB instance for user ${userId} on port ${port}.`);

        await new Promise<void>((resolve, reject) => {

            const onStdoutData = (data: Buffer) => {
                const message: string = data.toString();
                if (message.includes("Application startup complete.")) {
                    // as of version 0.4.22, this message signals a successful startup
                    console.log(`ChromaDB instance for user ${userId} is ready on port ${port}.`);
                    chromaProcess.stdout!.removeListener('data', onStdoutData);
                    chromaProcess.stderr!.removeListener('data', onStderrData);
                    resolve();
                }
            };

            const onStderrData = (data: Buffer) => {
                console.error(`Error from ChromaDB instance for user ${userId}: ${data}`);
            };

            const onClose = (code: number | null) => {
                const error = new Error(`ChromaDB instance for user ${userId} closed with code ${code}`);
                console.error(error.message);
                chromaProcess.stdout!.removeListener('data', onStdoutData);
                chromaProcess.stderr!.removeListener('data', onStderrData);
                reject(error);
            };

            const onError = (err: Error) => {
                console.error(`Failed to start ChromaDB instance for user ${userId} on port ${port}`, err);
                delete chromaDbInstances[userId];
                reject(err);
            };
            
            if (!chromaProcess.stdout) return;
            if (!chromaProcess.stderr) return;

            chromaProcess.stdout.on('data', onStdoutData);
            chromaProcess.stderr.on('data', onStderrData);
            chromaProcess.on('error', onError);
            chromaProcess.on('exit', onClose);
        });

        return port;
    } catch (error) {
        console.error('Error starting ChromaDB instance:', error);
        terminateInstance(userId);
        throw error;
    }
}

async function terminateInstance(userId:UUID): Promise<void> {
    if (userId) {
        if (chromaDbInstances[userId]) {
            if (!chromaDbInstances[userId].process.killed) {
                console.log(`Shutting down idle ChromaDB instance for user ${userId}.`);
                chromaDbInstances[userId].process.kill();
            }
            delete chromaDbInstances[userId];
        }
    }
}

function isValidUUID(token:string): boolean {
    // is the token a RFC 4122 compliant UUID?
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(token);
}

async function validateToken(token:string): Promise<string|null> {
    try {
        if (AUTH_SERVER_URL) {
            // we have an auth server, so request user validation here
            const response = await axios.get<validationDto>(AUTH_SERVER_URL, {
                headers: { 
                    'Authorization': `Bearer ${token}`, // token as bearer token..
                    'x-api-key': AUTH_SERVER_KEY        // ..and an optional x-api-key
                },
            });
    
            // we accept {userId} and {data:{userId}}, so look for either
            const userId = response.data?.data?.userId || response.data?.userId || null;
    
            if (userId) {
                return userId;
            }
        } else if (isValidUUID(token)){
            // config contains no server to validate the token against, so treat it as a already validated RFC 4122 UUID
            return token;
        }
        console.log('Could not validate user.');
        return null;
    } catch (error) {
        console.error('JWT validation error:', error);
        return null;
    }
}

const server = http.createServer(async (req:IncomingMessage, res:ServerResponse) => {

    // health check endpoint for letting remotes know that we're live; no auth needed
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
    }

    try {

        // ChromaDB clients use the x-chroma-token for access control. We're using that for the user token
        const token = req.headers['x-chroma-token'];
        if (!token || typeof token != "string") {
            // no token provided => 401
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'No token provided.' }));
            return;
        }

        // validate user token
        const userId = await validateToken(token);

        if (!userId) {
            // token invalid => 401
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Invalid token.' }));
            return;
        }

        if (!chromaDbInstances[userId]) {
            // user has no active ChromaDB instance, so start one
            await startChromaDbInstance(userId);
        }

        const instance:ChromaDbInstance = chromaDbInstances[userId];

        // refresh TTL
        instance.lastActive = Date.now();

        // remove the x-chroma-token header, not using it for its intended purpose
        delete req.headers['x-chroma-token'];

        // proxy the request to the database
        proxy.web(req, res, { target: `http://localhost:${instance.port}` });

    } catch (error) {
        console.error('Proxy flow error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'An error occurred' }));
    }
});

// Handle proxy errors
proxy.on('error', (error, req:IncomingMessage, res) => {
    console.error('Proxy error:', error);
    if (res instanceof ServerResponse) {
        if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
        }
    }
    res.end(JSON.stringify({ message: 'Error proxying request' }));
});

// Check for expired ChromaDB instances every minute
setInterval(() => {
    const now = Date.now();
    for (const userId in chromaDbInstances) {
        if (now - chromaDbInstances[userId].lastActive > DB_TTL) {
            // ChromaDB instance is expired, shut it down
            terminateInstance(userId);
        }
    }
}, 60000);

// Start the server
server.listen(APP_PORT, () => {
    console.log(`Chroma proxy server listening on port ${APP_PORT}.`);
});

const shutdownHandler = () => {
    console.log('Shutting down...');
    server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
    });
};

// clean up before shutting down
process.on('SIGINT', shutdownHandler);
process.on('SIGTERM', shutdownHandler);
process.on('exit', () => {
    Object.values(chromaDbInstances).forEach(instance => {
        // we are shutting down, so no need to clear the chromaDbInstance map
        instance.process.kill();
    });
    console.log('Exiting.');
});