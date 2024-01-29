import http, { IncomingMessage, ServerResponse } from 'node:http';
import httpProxy from 'http-proxy';
import https from 'node:https'
import Server from 'http-proxy';
import axios from 'axios';
import fs from 'node:fs';
import os from 'os';
import { ChromaDbInstance, validationDto, RequestStore } from './types';
import * as Config from './config';
import * as dbmanager from './instances';
import { AsyncLocalStorage } from 'node:async_hooks';
import consoleStamp from 'console-stamp';
import { v4 as uuidv4 } from 'uuid';
import { logger, Log } from './logger';
import pidusage from 'pidusage';

// Add timestamps to non-pino console logs
consoleStamp(console, { format: ':date(yyyy/mm/dd HH:MM:ss)' });

logger.info(Log.Type.AppStart,'Initializing app',Log.Context.App);

// Initialize server and storage
const proxy:Server = httpProxy.createProxyServer({});
const server:http.Server|https.Server = startServer();
const asyncLocalStorage = new AsyncLocalStorage();

// Give logger the ability to retrieve request stores aka AsyncLocalStorage stores for context retrieval
async function getRequest():Promise<RequestStore|null> {
    return (asyncLocalStorage.getStore() as RequestStore) || null;
}
logger.setRequestRetriever(getRequest);

// Set to `true` if the app shutdown process has begun
let isShuttingDown:boolean = false;

// Check whether a given token is a RFC 4122 compliant UUID
function isValidUUID(token:string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(token);
}

// Validate the user's token with the auth server or ensure that it's a pre-validated UUID
async function validateToken(token:string): Promise<string|null> {
    try {
        if (Config.AUTH_SERVER_URL) {
            // We have an auth server, so request user validation here
            const response = await axios.get<validationDto>(Config.AUTH_SERVER_URL, {
                headers: { 
                    'Authorization': `Bearer ${token}`, // Token as bearer token..
                    'x-api-key': Config.AUTH_SERVER_KEY        // ..and an optional x-api-key
                },
            });
    
            // We accept {userId} and {data:{userId}}, so look for either
            const userId = response.data?.data?.userId || response.data?.userId || null;
    
            if (userId) {
                return userId;
            }

        } else if (isValidUUID(token)){
            // Config contains no server to validate the token against, so treat it as a already validated RFC 4122 UUID
            return token;
        }
        return null;
    } catch (error) {
        logger.error(Log.Type.RequestValidationError,'Failed to validate user',Log.Context.Request);
        return null;
    }
}

async function handleRequest(req:IncomingMessage, res:ServerResponse) {

    const store:RequestStore = { id: uuidv4(), ip: req.socket.remoteAddress, url: req.url, startedAt: Date.now(), method: req.method };

    asyncLocalStorage.run(store, async () => {
        
        logger.info(Log.Type.RequestStart,'Handling new request',Log.Context.RequestExtended);
        
        // Public health check endpoint for letting remotes know that we're live; no auth needed
        if (req.url === '/health') {
            logger.debug(Log.Type.RequestIsHealthCheck,'Request is health check',Log.Context.Request);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
            return;
        }

        // Admin health check
        if (req.url === "/admin-health") {
            logger.debug(Log.Type.RequestIsAdmin,'Request is admin',Log.Context.Request);
            if (Config.ADMIN_API_KEY) {
                if (req.headers['x-api-key'] === Config.ADMIN_API_KEY) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    // TODO: Proper monitoring. For now, we'll just create and return a simple JSON detailing running instances and memory usage stats
                    const instancesHealth = await Promise.all(
                        Array.from(dbmanager.instances).map(async ([userId, instance]) => {
                          try {
                            const healthResponse = await axios.get(`http://localhost:${instance.port}/api/v1/heartbeat`);
                            let usage = null;
                            if (instance.process.pid && instance.ready) {
                                usage = await pidusage(instance.process.pid);
                            }
                            
                            const baseInfo = {
                              userId: userId,
                              port: instance.port,
                              pid: instance.process.pid,
                              memKb: (usage ? Math.round(usage?.memory/1000) : null),
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
                            } else {
                              return {
                                ...baseInfo,
                                status: 'error',
                                message: `ChromaDB instance responded with status code ${healthResponse.status}`,
                              };
                            }
                          } catch (error) {
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
                        })
                    );

                    const memory:any = {
                        kbTotal: Math.round(os.totalmem()/1000),
                        kbAvailable: Math.round(os.freemem()/1000),
                        kbAppUse: Math.round(process.memoryUsage().rss/1000),
                        kbInstanceUse: instancesHealth.reduce((acc,cur) => { return acc + (cur.memKb||0); },0),
                        kbInstanceAverage: 0,
                        kbUsedTotal: 0,
                        kbPercUsed: 0,
                        nMaxInstancesEstimate: 0
                    };
                    memory.kbUsedTotal = memory.kbAppUse + memory.kbInstanceUse;
                    memory.kbInstanceAverage = Math.round(memory.kbInstanceUse / instancesHealth.length);
                    memory.kbPercUsed = parseFloat((memory.kbUsedTotal / memory.kbTotal).toFixed(2));
                    memory.nMaxInstancesEstimate = Math.floor((memory.kbAvailable - (Config.DB_MINMEMORY/1000)) / memory.kbInstanceAverage) + instancesHealth.length;

                    res.end(JSON.stringify({ 
                        status: 'ok', 
                        instances: instancesHealth,
                        memory: memory
                    }));
                    return;
                } else {
                    logger.info(Log.Type.RequestAdminForbidden,'Invalid admin credentials',Log.Context.Request);
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: 'Invalid credentials' }));
                    return;
                }
            } else {
                logger.debug(Log.Type.RequestNoAdminEndpoint,'No admin endpoint available',Log.Context.Request);
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
                logger.debug(Log.Type.RequestNoToken,'No token provided',Log.Context.Request);
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'No token provided.' }));
                return;
            }

            // Validate user token
            const userId = await validateToken(token);

            if (!userId) {
                // Token invalid or auth server unavailable => 401
                logger.info(Log.Type.RequestForbidden,'Could not authenticate',Log.Context.Request);
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Invalid token.' }));
                return;
            }

            logger.debug(Log.Type.RequestValidated,'Validation successful',Log.Context.Request);

            store.userId = userId;

            if (!dbmanager.hasReadyInstance(userId)) {
                // User has no active and ready ChromaDB instance, so start one or add request to queue
                await dbmanager.enqueueInstanceStart(userId);
            } else {
                logger.debug(Log.Type.RequestHasInstance,'Instance already running',Log.Context.Request|Log.Context.Instance);
            }

            const instance:ChromaDbInstance = dbmanager.instances.get(userId)!;

            // Update instance stats
            instance.lastActive = Date.now();
            instance.requests++;

            // Remove the x-chroma-token and authorization headers, we are not using it for its intended purpose
            delete req.headers['x-chroma-token'];
            delete req.headers['authorization'];

            // Proxy the request to the database
            proxy.web(req, res, { target: `http://localhost:${instance.port}` },(error)=>{
                logger.error(Log.Type.RequestProxyError,'Proxy error',Log.Context.Request,error);
            });

        } catch (error) {
            logger.error(Log.Type.RequestFailed,'Request failed',Log.Context.Request|Log.Context.Instance,error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'An error occurred' }));
        }
    });
}

// Handle proxy errors
proxy.on('error', (error, req:IncomingMessage, res) => {
    logger.error(Log.Type.ProxyError,'Unexpected proxy error',Log.Context.Request,error,undefined);
    if (res instanceof ServerResponse) {
        if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
        }
    }
    res.end(JSON.stringify({ message: 'Error proxying request' }));
});

// ChromaDB instance responded without error, we consider this a successful request regardless of status code
proxy.on('proxyRes', (proxyRes, req:IncomingMessage, res:ServerResponse) => {
    logger.info(Log.Type.RequestFinished,`Request finished with status code ${proxyRes.statusCode}`,Log.Context.Request|Log.Context.InstanceExtended,undefined,undefined,{'statusCode':proxyRes.statusCode,'content-length':proxyRes.headers['content-length']});
});

// Check for expired ChromaDB instances
dbmanager.checkAndTerminateExpiredInstances();

// Start the server either via HTTP or HTTPS and bind to localhost if configured
function startServer(): http.Server|https.Server {

    logger.debug(Log.Type.ServerStart,'Server is starting');

    if (Config.ENABLE_SSL) {

        // SSL is enabled, but no web server is configured for the app. We use SSL in-app.

        if (!Config.CERT_FILE || !Config.CERT_KEY_FILE) {
            logger.fatal(Log.Type.ServerSSLCertPathError,'SSL certificate and key file paths must be specified');
            process.exit(1);
        }

        let sslKey:Buffer, sslCert:Buffer;

        try {
            sslKey = fs.readFileSync(Config.CERT_KEY_FILE);
            sslCert = fs.readFileSync(Config.CERT_FILE);
        } catch(error) {
            logger.fatal(Log.Type.ServerSSLCertReadError,'Error while reading SSL certificate or key file',undefined,error);
            process.exit(1);
        }

        const sslOptions:https.ServerOptions = {
            key: sslKey,
            cert: sslCert,
            rejectUnauthorized: false,
            requestCert: true
        };

        let srv = https.createServer(sslOptions,async (req:IncomingMessage, res:ServerResponse) => {
            handleRequest(req,res);
        });
        if (Config.BIND_LOCALHOST) {
            srv.listen(Config.APP_PORT, '127.0.0.1', () => {
                logger.info(Log.Type.ServerListening,`Server is listening on secure 127.0.0.1:${Config.APP_PORT}`);
            });
        } else {
            srv.listen(Config.APP_PORT, () => {
                logger.info(Log.Type.ServerListening,`Server is listening on secure 1.1.1.1:${Config.APP_PORT}`);
            });
        }
        return srv;

    } else {

        // No SSL

        let srv = http.createServer(async (req:IncomingMessage, res:ServerResponse) => {
            handleRequest(req,res);
        });
        if (Config.BIND_LOCALHOST) {
            srv.listen(Config.APP_PORT, '127.0.0.1', () => {
                logger.info(Log.Type.ServerListening,`Server is listening on 127.0.0.1:${Config.APP_PORT}`);
            });
        } else {
            srv.listen(Config.APP_PORT, () => {
                logger.info(Log.Type.ServerListening,`Server is listening on 1.1.1.1:${Config.APP_PORT}`);
            });
        }
        return srv;
    }
}

const shutdownHandler = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    // The logger messages in this function may never show up if the async logger functions take longer than the shutdown, but that's okay

    logger.info(Log.Type.AppShutdown,'App is shutting down');

    server.close(() => {
        logger.debug(Log.Type.ServerShutdown,'Server has shut down');
    });

    dbmanager.clearQueue('Server is shutting down.');

    // Terminate all ChromaDB instances gracefully
    if (dbmanager.instances.size) {
        logger.debug(Log.Type.TerminateAllInstances,`Terminating ${dbmanager.instances.size} instances`);
    }
    const terminationPromises = Array.from(dbmanager.instances.values()).map(instance => {
        return new Promise<void>((resolve) => {
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
            logger.info(Log.Type.AppExitAfterTermination,'Exiting after instance termination');
            process.exit(0);
        } catch (error) {
            logger.fatal(Log.Type.TerminateAllInstancesError,'Failed to shutdown instances',Log.Context.Instances,error);
            process.exit(1);
        }
    } else {
        logger.info(Log.Type.AppExit,'Exiting');
        process.exit(0);
    }
};

// Shutdown handlers so we can clean up before shutting down
process.on('SIGINT', shutdownHandler);
process.on('SIGTERM', shutdownHandler);
process.on('exit',()=>{
    if (!isShuttingDown) {
        shutdownHandler();
        console.log("Exiting app..")
    }
});