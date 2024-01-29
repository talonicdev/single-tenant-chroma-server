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
const node_https_1 = __importDefault(require("node:https"));
const axios_1 = __importDefault(require("axios"));
const node_fs_1 = __importDefault(require("node:fs"));
const os_1 = __importDefault(require("os"));
const Config = __importStar(require("./config"));
const dbmanager = __importStar(require("./instances"));
const node_async_hooks_1 = require("node:async_hooks");
const console_stamp_1 = __importDefault(require("console-stamp"));
const uuid_1 = require("uuid");
const logger_1 = require("./logger");
const pidusage_1 = __importDefault(require("pidusage"));
// Add timestamps to non-pino console logs
(0, console_stamp_1.default)(console, { format: ':date(yyyy/mm/dd HH:MM:ss)' });
logger_1.logger.info(logger_1.Log.Type.AppStart, 'Initializing app', logger_1.Log.Context.App);
// Initialize server and storage
const proxy = http_proxy_1.default.createProxyServer({});
const server = startServer();
const asyncLocalStorage = new node_async_hooks_1.AsyncLocalStorage();
// Give logger the ability to retrieve request stores aka AsyncLocalStorage stores for context retrieval
async function getRequest() {
    return asyncLocalStorage.getStore() || null;
}
logger_1.logger.setRequestRetriever(getRequest);
// Set to `true` if the app shutdown process has begun
let isShuttingDown = false;
// Check whether a given token is a RFC 4122 compliant UUID
function isValidUUID(token) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(token);
}
// Validate the user's token with the auth server or ensure that it's a pre-validated UUID
async function validateToken(token) {
    var _a, _b, _c;
    try {
        if (Config.AUTH_SERVER_URL) {
            // We have an auth server, so request user validation here
            const response = await axios_1.default.get(Config.AUTH_SERVER_URL, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'x-api-key': Config.AUTH_SERVER_KEY // ..and an optional x-api-key
                },
            });
            // We accept {userId} and {data:{userId}}, so look for either
            const userId = ((_b = (_a = response.data) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.userId) || ((_c = response.data) === null || _c === void 0 ? void 0 : _c.userId) || null;
            if (userId) {
                return userId;
            }
        }
        else if (isValidUUID(token)) {
            // Config contains no server to validate the token against, so treat it as a already validated RFC 4122 UUID
            return token;
        }
        return null;
    }
    catch (error) {
        logger_1.logger.error(logger_1.Log.Type.RequestValidationError, 'Failed to validate user', logger_1.Log.Context.Request);
        return null;
    }
}
async function handleRequest(req, res) {
    const store = { id: (0, uuid_1.v4)(), ip: req.socket.remoteAddress, url: req.url, startedAt: Date.now(), method: req.method };
    asyncLocalStorage.run(store, async () => {
        logger_1.logger.info(logger_1.Log.Type.RequestStart, 'Handling new request', logger_1.Log.Context.RequestExtended);
        // Public health check endpoint for letting remotes know that we're live; no auth needed
        if (req.url === '/health') {
            logger_1.logger.debug(logger_1.Log.Type.RequestIsHealthCheck, 'Request is health check', logger_1.Log.Context.Request);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
            return;
        }
        // Admin health check
        if (req.url === "/admin-health") {
            logger_1.logger.debug(logger_1.Log.Type.RequestIsAdmin, 'Request is admin', logger_1.Log.Context.Request);
            if (Config.ADMIN_API_KEY) {
                if (req.headers['x-api-key'] === Config.ADMIN_API_KEY) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    // TODO: Proper monitoring. For now, we'll just create and return a simple JSON detailing running instances and memory usage stats
                    const instancesHealth = await Promise.all(Array.from(dbmanager.instances).map(async ([userId, instance]) => {
                        try {
                            const healthResponse = await axios_1.default.get(`http://localhost:${instance.port}/api/v1/heartbeat`);
                            let usage = null;
                            if (instance.process.pid && instance.ready) {
                                usage = await (0, pidusage_1.default)(instance.process.pid);
                            }
                            const baseInfo = {
                                userId: userId,
                                port: instance.port,
                                pid: instance.process.pid,
                                memKb: (usage ? Math.round((usage === null || usage === void 0 ? void 0 : usage.memory) / 1000) : null),
                                startedAt: new Date(instance.startedAt).toISOString(),
                                lastActive: new Date(instance.lastActive).toISOString(),
                                ready: instance.ready,
                                requests: instance.requests
                            };
                            if (healthResponse.status === 200) {
                                return {
                                    ...baseInfo,
                                    status: 'healthy'
                                };
                            }
                            else {
                                return {
                                    ...baseInfo,
                                    status: 'error',
                                    message: `ChromaDB instance responded with status code ${healthResponse.status}`,
                                };
                            }
                        }
                        catch (error) {
                            return {
                                userId: userId,
                                port: instance.port,
                                pid: instance.process.pid,
                                ready: instance.ready,
                                requests: instance.requests,
                                memKb: 0,
                                status: 'error',
                                startedAt: new Date(instance.startedAt).toLocaleString(),
                                lastActive: new Date(instance.lastActive).toLocaleString(),
                                message: 'ChromaDB instance ping returned an error.',
                            };
                        }
                    }));
                    const memory = {
                        kbTotal: Math.round(os_1.default.totalmem() / 1000),
                        kbAvailable: Math.round(os_1.default.freemem() / 1000),
                        kbAppUse: Math.round(process.memoryUsage().rss / 1000),
                        kbInstanceUse: instancesHealth.reduce((acc, cur) => { return acc + (cur.memKb || 0); }, 0),
                        kbInstanceAverage: 0,
                        kbUsedTotal: 0,
                        kbPercUsed: 0,
                        nMaxInstancesEstimate: 0
                    };
                    memory.kbUsedTotal = memory.kbAppUse + memory.kbInstanceUse;
                    memory.kbInstanceAverage = Math.round(memory.kbInstanceUse / instancesHealth.length);
                    memory.kbPercUsed = parseFloat((memory.kbUsedTotal / memory.kbTotal).toFixed(2));
                    memory.nMaxInstancesEstimate = Math.floor((memory.kbAvailable - (Config.DB_MINMEMORY / 1000)) / memory.kbInstanceAverage) + instancesHealth.length;
                    res.end(JSON.stringify({
                        status: 'ok',
                        instances: instancesHealth,
                        memory: memory
                    }));
                    return;
                }
                else {
                    logger_1.logger.info(logger_1.Log.Type.RequestAdminForbidden, 'Invalid admin credentials', logger_1.Log.Context.Request);
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: 'Invalid credentials' }));
                    return;
                }
            }
            else {
                logger_1.logger.debug(logger_1.Log.Type.RequestNoAdminEndpoint, 'No admin endpoint available', logger_1.Log.Context.Request);
                res.writeHead(404, { 'Content-Type': 'application/json' }).end();
                return;
            }
        }
        try {
            // ChromaDB clients use the `authorization` header for access control. We're using that for the user token.
            // Some docs describe `x-chroma-token` as the token header, however, so we're testing for that as well.
            const token = req.headers['x-chroma-token'] || (req.headers['authorization'] ? req.headers['authorization'].slice(7) : '');
            if (!token || typeof token != "string") {
                // No token provided => 401
                logger_1.logger.debug(logger_1.Log.Type.RequestNoToken, 'No token provided', logger_1.Log.Context.Request);
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'No token provided.' }));
                return;
            }
            // Validate user token
            const userId = await validateToken(token);
            if (!userId) {
                // Token invalid or auth server unavailable => 401
                logger_1.logger.info(logger_1.Log.Type.RequestForbidden, 'Could not authenticate', logger_1.Log.Context.Request);
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Invalid token.' }));
                return;
            }
            logger_1.logger.debug(logger_1.Log.Type.RequestValidated, 'Validation successful', logger_1.Log.Context.Request);
            store.userId = userId;
            if (!dbmanager.hasReadyInstance(userId)) {
                // User has no active and ready ChromaDB instance, so start one or add request to queue
                await dbmanager.enqueueInstanceStart(userId);
            }
            else {
                logger_1.logger.debug(logger_1.Log.Type.RequestHasInstance, 'Instance already running', logger_1.Log.Context.Request | logger_1.Log.Context.Instance);
            }
            const instance = dbmanager.instances.get(userId);
            // Update instance stats
            instance.lastActive = Date.now();
            instance.requests++;
            // Remove the x-chroma-token and authorization headers, we are not using it for its intended purpose
            delete req.headers['x-chroma-token'];
            delete req.headers['authorization'];
            // Proxy the request to the database
            proxy.web(req, res, { target: `http://localhost:${instance.port}` }, (error) => {
                logger_1.logger.error(logger_1.Log.Type.RequestProxyError, 'Proxy error', logger_1.Log.Context.Request, error);
            });
        }
        catch (error) {
            logger_1.logger.error(logger_1.Log.Type.RequestFailed, 'Request failed', logger_1.Log.Context.Request | logger_1.Log.Context.Instance, error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'An error occurred' }));
        }
    });
}
// Handle proxy errors
proxy.on('error', (error, req, res) => {
    logger_1.logger.error(logger_1.Log.Type.ProxyError, 'Unexpected proxy error', logger_1.Log.Context.Request, error, undefined);
    if (res instanceof node_http_1.ServerResponse) {
        if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
        }
    }
    res.end(JSON.stringify({ message: 'Error proxying request' }));
});
// ChromaDB instance responded without error, we consider this a successful request regardless of status code
proxy.on('proxyRes', (proxyRes, req, res) => {
    logger_1.logger.info(logger_1.Log.Type.RequestFinished, `Request finished with status code ${proxyRes.statusCode}`, logger_1.Log.Context.Request | logger_1.Log.Context.InstanceExtended, undefined, undefined, { 'statusCode': proxyRes.statusCode, 'content-length': proxyRes.headers['content-length'] });
});
// Check for expired ChromaDB instances
dbmanager.checkAndTerminateExpiredInstances();
// Start the server either via HTTP or HTTPS and bind to localhost if configured
function startServer() {
    logger_1.logger.debug(logger_1.Log.Type.ServerStart, 'Server is starting');
    if (Config.ENABLE_SSL) {
        // SSL is enabled, but no web server is configured for the app. We use SSL in-app.
        if (!Config.CERT_FILE || !Config.CERT_KEY_FILE) {
            logger_1.logger.fatal(logger_1.Log.Type.ServerSSLCertPathError, 'SSL certificate and key file paths must be specified');
            process.exit(1);
        }
        let sslKey, sslCert;
        try {
            sslKey = node_fs_1.default.readFileSync(Config.CERT_KEY_FILE);
            sslCert = node_fs_1.default.readFileSync(Config.CERT_FILE);
        }
        catch (error) {
            logger_1.logger.fatal(logger_1.Log.Type.ServerSSLCertReadError, 'Error while reading SSL certificate or key file', undefined, error);
            process.exit(1);
        }
        const sslOptions = {
            key: sslKey,
            cert: sslCert,
            rejectUnauthorized: false,
            requestCert: true
        };
        let srv = node_https_1.default.createServer(sslOptions, async (req, res) => {
            handleRequest(req, res);
        });
        if (Config.BIND_LOCALHOST) {
            srv.listen(Config.APP_PORT, '127.0.0.1', () => {
                logger_1.logger.info(logger_1.Log.Type.ServerListening, `Server is listening on secure 127.0.0.1:${Config.APP_PORT}`);
            });
        }
        else {
            srv.listen(Config.APP_PORT, () => {
                logger_1.logger.info(logger_1.Log.Type.ServerListening, `Server is listening on secure 1.1.1.1:${Config.APP_PORT}`);
            });
        }
        return srv;
    }
    else {
        // No SSL
        let srv = node_http_1.default.createServer(async (req, res) => {
            handleRequest(req, res);
        });
        if (Config.BIND_LOCALHOST) {
            srv.listen(Config.APP_PORT, '127.0.0.1', () => {
                logger_1.logger.info(logger_1.Log.Type.ServerListening, `Server is listening on 127.0.0.1:${Config.APP_PORT}`);
            });
        }
        else {
            srv.listen(Config.APP_PORT, () => {
                logger_1.logger.info(logger_1.Log.Type.ServerListening, `Server is listening on 1.1.1.1:${Config.APP_PORT}`);
            });
        }
        return srv;
    }
}
const shutdownHandler = async () => {
    if (isShuttingDown)
        return;
    isShuttingDown = true;
    // The logger messages in this function may never show up if the async logger functions take longer than the shutdown, but that's okay
    logger_1.logger.info(logger_1.Log.Type.AppShutdown, 'App is shutting down');
    server.close(() => {
        logger_1.logger.debug(logger_1.Log.Type.ServerShutdown, 'Server has shut down');
    });
    dbmanager.clearQueue('Server is shutting down.');
    // Terminate all ChromaDB instances gracefully
    if (dbmanager.instances.size) {
        logger_1.logger.debug(logger_1.Log.Type.TerminateAllInstances, `Terminating ${dbmanager.instances.size} instances`);
    }
    const terminationPromises = Array.from(dbmanager.instances.values()).map(instance => {
        return new Promise((resolve) => {
            instance.process.on('exit', () => {
                //console.log(`ChromaDB instance on port ${instance.port} has been shut down.`);
                resolve();
            });
            instance.process.kill();
        });
    });
    if (terminationPromises.length) {
        try {
            await Promise.all([...terminationPromises]);
            logger_1.logger.info(logger_1.Log.Type.AppExitAfterTermination, 'Exiting after instance termination');
            process.exit(0);
        }
        catch (error) {
            logger_1.logger.fatal(logger_1.Log.Type.TerminateAllInstancesError, 'Failed to shutdown instances', logger_1.Log.Context.Instances, error);
            process.exit(1);
        }
    }
    else {
        logger_1.logger.info(logger_1.Log.Type.AppExit, 'Exiting');
        process.exit(0);
    }
};
// Shutdown handlers so we can clean up before shutting down
process.on('SIGINT', shutdownHandler);
process.on('SIGTERM', shutdownHandler);
process.on('exit', () => {
    if (!isShuttingDown) {
        shutdownHandler();
        console.log("Exiting app..");
    }
});
