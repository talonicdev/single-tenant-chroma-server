"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = __importStar(require("node:http"));
const http_proxy_1 = __importDefault(require("http-proxy"));
const child_process_1 = require("child_process");
const portfinder_1 = __importDefault(require("portfinder"));
const axios_1 = __importDefault(require("axios"));
const yargs_1 = __importDefault(require("yargs"));
const helpers_1 = require("yargs/helpers");
const yaml_1 = __importDefault(require("yaml"));
const fs_1 = __importDefault(require("fs"));
require("dotenv/config");
const console_stamp_1 = __importDefault(require("console-stamp"));
// Add timestamps to console logs
(0, console_stamp_1.default)(console, { format: ':date(yyyy/mm/dd HH:MM:ss.l)' });
// Parse command-line arguments, if any
const argv = (0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
    .options({
    port: { type: 'number', demandOption: false, alias: 'p' },
    authServerEndpoint: { type: 'string', demandOption: false, alias: 'auth' },
    authServerAPIKey: { type: 'string', demandOption: false, alias: 'authKey' },
    dbPath: { type: 'string', demandOption: false, alias: 'db' },
    dbTTL: { type: 'number', demandOption: false, alias: 'ttl' },
})
    .parseSync();
// Parse config.yaml, if any
let yamlConfig = {};
let configFile = '';
try {
    configFile = fs_1.default.readFileSync('./config.yml', 'utf8');
}
catch (error) {
}
if (configFile) {
    try {
        yamlConfig = yaml_1.default.parse(fs_1.default.readFileSync('./config.yml', 'utf8'));
    }
    catch (error) {
        console.error('config.yml found, but invalid.', error);
        throw new Error('config.yml invalid.');
    }
}
// Populate settings from args, config file, env or defaults
const APP_PORT = argv.port || yamlConfig.appPort || parseInt(process.env.APP_PORT || "8080");
const AUTH_SERVER_URL = argv.authServerEndpoint || yamlConfig.authServerEndpoint || process.env.AUTH_SERVER_ENDPOINT || "";
const AUTH_SERVER_KEY = argv.authServerAPIKey || yamlConfig.authServerAPIKey || process.env.AUTH_SERVER_APIKEY || "";
const DB_PATH = argv.dbPath || yamlConfig.dbPath || process.env.DB_PATH || "./chromadb";
const DB_TTL = argv.dbTTL || yamlConfig.dbTTL || parseInt(process.env.DB_TTL || "180000");
// Initialize proxy server and ChromaDB instances map
const proxy = http_proxy_1.default.createProxyServer({});
const chromaDbInstances = {};
console.log(`Config: Port ${APP_PORT}, Auth Server URL: ${AUTH_SERVER_URL}, DB Path: ${DB_PATH}, ChromaDB TTL: ${DB_TTL}.`);
async function startChromaDbInstance(userId) {
    try {
        const port = await portfinder_1.default.getPortPromise(); // get any available port
        const dbPath = `${DB_PATH}/${userId}`;
        // start ChromaDB CLI for the given user
        const chromaProcess = (0, child_process_1.spawn)('chroma', ['run', '--host', '127.0.0.1', '--path', dbPath, '--port', String(port)], {
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
        await new Promise((resolve, reject) => {
            const onStdoutData = (data) => {
                const message = data.toString();
                if (message.includes("Application startup complete.")) {
                    // as of version 0.4.22, this message signals a successful startup
                    console.log(`ChromaDB instance for user ${userId} is ready on port ${port}.`);
                    chromaProcess.stdout.removeListener('data', onStdoutData);
                    chromaProcess.stderr.removeListener('data', onStderrData);
                    resolve();
                }
            };
            const onStderrData = (data) => {
                console.error(`Error from ChromaDB instance for user ${userId}: ${data}`);
            };
            const onClose = (code) => {
                const error = new Error(`ChromaDB instance for user ${userId} closed with code ${code}`);
                console.error(error.message);
                chromaProcess.stdout.removeListener('data', onStdoutData);
                chromaProcess.stderr.removeListener('data', onStderrData);
                reject(error);
            };
            const onError = (err) => {
                console.error(`Failed to start ChromaDB instance for user ${userId} on port ${port}`, err);
                delete chromaDbInstances[userId];
                reject(err);
            };
            if (!chromaProcess.stdout)
                return;
            if (!chromaProcess.stderr)
                return;
            chromaProcess.stdout.on('data', onStdoutData);
            chromaProcess.stderr.on('data', onStderrData);
            chromaProcess.on('error', onError);
            chromaProcess.on('exit', onClose);
        });
        return port;
    }
    catch (error) {
        console.error('Error starting ChromaDB instance:', error);
        terminateInstance(userId);
        throw error;
    }
}
async function terminateInstance(userId) {
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
function isValidUUID(token) {
    // is the token a RFC 4122 compliant UUID?
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(token);
}
async function validateToken(token) {
    var _a, _b, _c;
    try {
        if (AUTH_SERVER_URL) {
            // we have an auth server, so request user validation here
            const response = await axios_1.default.get(AUTH_SERVER_URL, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'x-api-key': AUTH_SERVER_KEY // ..and an optional x-api-key
                },
            });
            // we accept {userId} and {data:{userId}}, so look for either
            const userId = ((_b = (_a = response.data) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.userId) || ((_c = response.data) === null || _c === void 0 ? void 0 : _c.userId) || null;
            if (userId) {
                return userId;
            }
        }
        else if (isValidUUID(token)) {
            // config contains no server to validate the token against, so treat it as a already validated RFC 4122 UUID
            return token;
        }
        console.log('Could not validate user.');
        return null;
    }
    catch (error) {
        console.error('JWT validation error:', error);
        return null;
    }
}
const server = node_http_1.default.createServer(async (req, res) => {
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
        const instance = chromaDbInstances[userId];
        // refresh TTL
        instance.lastActive = Date.now();
        // remove the x-chroma-token header, not using it for its intended purpose
        delete req.headers['x-chroma-token'];
        // proxy the request to the database
        proxy.web(req, res, { target: `http://localhost:${instance.port}` });
    }
    catch (error) {
        console.error('Proxy flow error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'An error occurred' }));
    }
});
// Handle proxy errors
proxy.on('error', (error, req, res) => {
    console.error('Proxy error:', error);
    if (res instanceof node_http_1.ServerResponse) {
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
