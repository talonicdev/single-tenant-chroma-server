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
exports.enqueueInstanceStart = exports.clearQueue = exports.checkAndTerminateExpiredInstances = exports.hasReadyInstance = exports.instances = void 0;
const child_process_1 = require("child_process");
const node_fs_1 = __importDefault(require("node:fs"));
const os_1 = __importDefault(require("os"));
const portfinder_1 = __importDefault(require("portfinder"));
const Config = __importStar(require("./config"));
const logger_1 = require("./logger");
// A ChromaDB instance will be deemed as successfully launched if stdout contains this message
const DB_LAUNCH_SUCCESS_INDICATOR = "Application startup complete.";
exports.instances = new Map();
const queue = new Map();
let maxInstancesTimestamp = null;
async function getInstance(userId) {
    return exports.instances.get(userId) || null;
}
async function getInstances() {
    return Array.from(exports.instances.values());
}
logger_1.logger.setInstanceRetriever(getInstance);
logger_1.logger.setInstancesRetriever(getInstances);
// Attempt to start a ChromaDB instance for the user up to MAX_RETRIES times
async function startInstance(userId, attempts = 0) {
    try {
        return await attemptOneInstanceStart(userId, attempts + 1);
    }
    catch (error) {
        if (attempts < Config.MAX_RETRIES) {
            return await startInstance(userId, attempts + 1);
        }
        else {
            logger_1.logger.error(logger_1.Log.Type.InstanceStartMaxRetries, `Giving up instance creation after ${Config.MAX_RETRIES} retries`, logger_1.Log.Context.Instance, error, userId);
            throw error;
        }
    }
}
function instanceName(userId) {
    var _a;
    return ((_a = exports.instances.get(userId)) === null || _a === void 0 ? void 0 : _a.name) || userId || '';
}
function hasReadyInstance(userId) {
    var _a;
    return (_a = exports.instances.get(userId)) === null || _a === void 0 ? void 0 : _a.ready;
}
exports.hasReadyInstance = hasReadyInstance;
// Perform attempt to start a ChromaDB instance for the user
async function attemptOneInstanceStart(userId, attempt) {
    let timeout;
    try {
        // Get any available port, but bind it to localhost, so we don't accidentally databases to the internet
        const port = await portfinder_1.default.getPortPromise({ host: '127.0.0.1' });
        const dbPath = `${Config.DB_PATH}/${userId}`;
        let stderrOut = '';
        // Terminate any user instances if a request somehow made it past the previous check
        await terminateInstance(userId);
        logger_1.logger.debug(logger_1.Log.Type.InstanceSpawn, `Spawning new instance`, logger_1.Log.Context.Request);
        // Start ChromaDB CLI for the given user
        const chromaProcess = (0, child_process_1.spawn)('chroma', ['run', '--host', '127.0.0.1', '--path', dbPath, '--port', String(port)], {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        // Add new instance to the map
        let now = Date.now();
        exports.instances.set(userId, {
            port,
            lastActive: now,
            startedAt: now,
            process: chromaProcess,
            attempt: attempt,
            ready: false,
            requests: 0,
            name: `${userId}:${port}:${now}`
        });
        logger_1.logger.debug(logger_1.Log.Type.InstanceInitializing, 'Waiting for instance', logger_1.Log.Context.Instance);
        await new Promise((resolve, reject) => {
            function doReject(reason) {
                chromaProcess.stdout.removeListener('data', onStdoutData);
                chromaProcess.stderr.removeListener('data', onStderrData);
                chromaProcess.removeListener('error', onError);
                //chromaProcess.removeListener('exit',onClose);
                clearTimeout(timeout);
                reject(reason);
            }
            function doResolve() {
                chromaProcess.stdout.removeListener('data', onStdoutData);
                chromaProcess.stderr.removeListener('data', onStderrData);
                chromaProcess.removeListener('error', onError);
                //chromaProcess.removeListener('exit',onClose);
                clearTimeout(timeout);
                resolve();
            }
            timeout = setTimeout(() => {
                // Instance did not start within the time limit
                doReject(new Error(`Instance ${instanceName(userId)} did not launch within ${Config.DB_TIMEOUT} ms.`));
            }, Config.DB_TIMEOUT);
            const onStdoutData = (data) => {
                const message = data.toString();
                if (message.includes(DB_LAUNCH_SUCCESS_INDICATOR)) {
                    // as of version 0.4.22, this message signals a successful startup
                    logger_1.logger.debug(logger_1.Log.Type.InstanceReady, 'Instance is ready', logger_1.Log.Context.InstanceExtended, undefined, userId);
                    doResolve();
                }
            };
            const onStderrData = (data) => {
                stderrOut += data;
            };
            const onClose = (code) => {
                if (code !== 0) {
                    doReject(new Error(`Instance ${instanceName(userId)} closed with code ${code}:\n ${stderrOut}`));
                }
                else {
                    logger_1.logger.debug(logger_1.Log.Type.InstanceShutdown, 'Instance shut down.', logger_1.Log.Context.Instance, null, userId);
                    doReject();
                }
            };
            const onError = (err) => {
                logger_1.logger.error(logger_1.Log.Type.InstanceSpawnError, 'Failed to spawn instance', logger_1.Log.Context.Instance, err, userId);
                doReject(err);
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
        const instance = exports.instances.get(userId);
        if (instance) {
            instance.ready = true;
        }
        return port;
    }
    catch (error) {
        logger_1.logger.error(logger_1.Log.Type.InstanceStartError, 'Failed to start instance', logger_1.Log.Context.InstanceExtended, error);
        if (timeout)
            clearTimeout(timeout);
        await terminateInstance(userId);
        throw error;
    }
}
// Terminate ChromaDB instance for the given user
async function terminateInstance(userId) {
    if (userId) {
        if (exports.instances.has(userId)) {
            const instance = exports.instances.get(userId);
            if (!instance.process.killed) {
                return new Promise((resolve) => {
                    instance.process.once('exit', () => {
                        exports.instances.delete(userId);
                        resolve();
                    });
                    instance.process.kill();
                });
            }
            exports.instances.delete(userId);
        }
    }
}
// Retrieve a single instance that has been idle the longest and for more than DB_TTL_CONGESTED ms.
function getTerminableInstance() {
    let oldestInstance = null;
    exports.instances.forEach((instance, userId) => {
        const idleTime = Date.now() - instance.lastActive;
        if (!oldestInstance || (idleTime > oldestInstance.lastActive && idleTime > Config.DB_TTL_CONGESTED)) {
            oldestInstance = { userId, lastActive: instance.lastActive };
        }
    });
    return oldestInstance;
}
// Terminate ChromaDB instances that have been idle for DB_TTL ms or longer
function checkAndTerminateExpiredInstances() {
    const now = Date.now();
    exports.instances.forEach((instance, userId) => {
        if (now - instance.lastActive > Config.DB_TTL) {
            logger_1.logger.debug(logger_1.Log.Type.InstanceInactivityShutdown, 'Instance shutting down due to inactivity', logger_1.Log.Context.InstanceExtended, undefined, userId);
            terminateInstance(userId).then(() => {
                // Attempt to process the queue after terminating an instance
                processQueue();
            }).catch((error) => {
                logger_1.logger.error(logger_1.Log.Type.InstanceTerminationError, 'Failed to terminate expired instance', logger_1.Log.Context.InstanceExtended, error, userId);
            });
        }
    });
    // Perform the next check in 1 minute
    setTimeout(checkAndTerminateExpiredInstances, 60000);
}
exports.checkAndTerminateExpiredInstances = checkAndTerminateExpiredInstances;
function clearQueue(reason) {
    // Clear queue timeouts and reject promises
    queue.forEach(entry => {
        clearTimeout(entry.timeoutHandle);
        entry.reject(new Error(reason));
    });
}
exports.clearQueue = clearQueue;
// Add instance start for a user to the queue
async function enqueueInstanceStart(userId) {
    let entry = queue.get(userId);
    if (entry) {
        // User is already awaiting an instance, return the existing promise for this user
        return entry.promise;
    }
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    const timeoutHandle = setTimeout(() => {
        // Handle queue timeout
        entry = queue.get(userId);
        if (entry) {
            queue.delete(userId);
            entry.reject(new Error('Request timed out. The system is experiencing heavy load. Please try again later.'));
        }
    }, Config.QUEUE_TIMEOUT);
    entry = {
        promise,
        resolve: resolve,
        reject: reject,
        timeoutHandle,
    };
    // Add the userId and corresponding queue entry to the map
    queue.set(userId, entry);
    // Immediately attempt to process the queue if under max capacity
    processQueue();
    return promise;
}
exports.enqueueInstanceStart = enqueueInstanceStart;
// Process the queue when possible
function processQueue() {
    const freemem = os_1.default.freemem();
    if (exports.instances.size >= Config.MAX_INSTANCES || freemem < Config.DB_MINMEMORY) {
        // We hit MAX_INSTANCES or memory threshold, try freeing up an idle instance
        if (exports.instances.size === Config.MAX_INSTANCES) {
            const now = Date.now();
            if (maxInstancesTimestamp === null || (now - maxInstancesTimestamp) > Config.MAX_INSTANCES_LOG_COOLDOWN) {
                logger_1.logger.info(logger_1.Log.Type.InstanceCreationMaxInstances, `Amount of ChromaDB instances exceeds ${Config.MAX_INSTANCES}.`, logger_1.Log.Context.Instance);
                maxInstancesTimestamp = now;
            }
        }
        if (freemem < Config.DB_MINMEMORY) {
            logger_1.logger.warn(logger_1.Log.Type.InstanceCreationMaxMemory, `Available memory lower than ${Config.DB_MINMEMORY} kb`, logger_1.Log.Context.Instance | logger_1.Log.Context.Instances);
        }
        const oldestInstanceInfo = getTerminableInstance();
        if (oldestInstanceInfo) {
            terminateInstance(oldestInstanceInfo.userId).then(() => {
                // Attempt to process the queue after terminating the oldest idle instance
                processQueue();
            }).catch(error => {
                return; // Exit the function to wait for an instance to terminate normally
            });
        }
        else {
            return; // Exit the function to wait for an instance to terminate
        }
    }
    else {
        maxInstancesTimestamp = null;
    }
    if (queue.size > 0) {
        // Process the next entry in the queue, if any
        const queueEntry = queue.entries().next().value;
        if (!queueEntry) {
            logger_1.logger.error(logger_1.Log.Type.Unexpected, 'Next queue entry expected, but not found.');
            return;
        }
        const [userId, entry] = queueEntry;
        // Clear the timeout as we're starting to process
        clearTimeout(entry.timeoutHandle);
        // Try to start the instance, resolve or reject the promise accordingly
        startInstance(userId)
            .then(port => entry.resolve(port))
            .catch(error => entry.reject())
            .finally(() => {
            // Continue processing the queue regardless of the outcome
            queue.delete(userId);
            processQueue();
        });
    }
}
// Check file paths
(() => {
    try {
        if (node_fs_1.default.existsSync(Config.DB_PATH)) {
            node_fs_1.default.accessSync(Config.DB_PATH, node_fs_1.default.constants.R_OK | node_fs_1.default.constants.W_OK); // Test if we can read and write the database directory
        }
        else {
            node_fs_1.default.mkdirSync(Config.DB_PATH, { recursive: true, mode: 0o750 }); // Create database directory with rwxr-x--- permissions
            logger_1.logger.info(logger_1.Log.Type.DatabasePathCreation, `Created database directory ${Config.DB_PATH}.`);
        }
    }
    catch (error) {
        logger_1.logger.fatal(logger_1.Log.Type.DatabasePathError, `Can not read or write database directory '${Config.DB_PATH}'`, undefined, error);
        process.exit(1);
    }
})();
