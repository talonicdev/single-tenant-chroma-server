import { UUID, ChromaDbInstance, QueueEntry } from './types';
import { spawn, ChildProcess } from 'child_process';
import fs from 'node:fs';
import os from 'os';
import portfinder from 'portfinder';
import * as Config from './config';
import { logger, Log } from './logger';

// A ChromaDB instance will be deemed as successfully launched if stdout contains this message
const DB_LAUNCH_SUCCESS_INDICATOR:string = "Application startup complete.";

export const instances: Map<UUID, ChromaDbInstance> = new Map();
const queue = new Map<UUID, QueueEntry>();
let maxInstancesTimestamp: number | null = null;

async function getInstance(userId:UUID): Promise<ChromaDbInstance|null> {
    return instances.get(userId) || null;
}
async function getInstances(): Promise<Array<ChromaDbInstance>> {
    return Array.from(instances.values());
}

logger.setInstanceRetriever(getInstance);
logger.setInstancesRetriever(getInstances);

// Attempt to start a ChromaDB instance for the user up to MAX_RETRIES times
async function startInstance(userId: UUID, attempts: number = 0): Promise<number> {
    try {
        return await attemptOneInstanceStart(userId,attempts+1);
    } catch (error) {
        if (attempts < Config.MAX_RETRIES) {
            return await startInstance(userId, attempts + 1);
        } else {
            logger.error(Log.Type.InstanceStartMaxRetries,`Giving up instance creation after ${Config.MAX_RETRIES} retries`,Log.Context.Instance,error,userId);
            throw error;
        }
    }
}

function instanceName(userId:UUID): string {
    return instances.get(userId)?.name || userId || '';
}

export function hasReadyInstance(userId:UUID) {
    return instances.get(userId)?.ready;
}

// Perform attempt to start a ChromaDB instance for the user
async function attemptOneInstanceStart(userId: UUID,attempt?:number): Promise<number> {

    let timeout:NodeJS.Timeout|undefined;

    try {

        // Get any available port, but bind it to localhost, so we don't accidentally databases to the internet
        const port: number = await portfinder.getPortPromise({host: '127.0.0.1'}); 

        const dbPath: string = `${Config.DB_PATH}/${userId}`;

        let stderrOut: string = '';

        // Terminate any user instances if a request somehow made it past the previous check
        await terminateInstance(userId);

        logger.debug(Log.Type.InstanceSpawn,`Spawning new instance`,Log.Context.Request);
        
        // Start ChromaDB CLI for the given user
        const chromaProcess: ChildProcess = spawn('chroma', ['run', '--host', '127.0.0.1', '--path', dbPath, '--port', String(port)], {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        // Add new instance to the map
        let now = Date.now();
        instances.set(userId,{
            port,
            lastActive: now,
            startedAt: now,
            process: chromaProcess,
            attempt: attempt,
            ready: false,
            requests: 0,
            name: `${userId}:${port}:${now}`
        });

        logger.debug(Log.Type.InstanceInitializing,'Waiting for instance',Log.Context.Instance);

        await new Promise<void>((resolve, reject) => {

            function doReject(reason?:string|Error) {
                chromaProcess.stdout!.removeListener('data', onStdoutData);
                chromaProcess.stderr!.removeListener('data', onStderrData);
                chromaProcess.removeListener('error',onError);
                //chromaProcess.removeListener('exit',onClose);
                clearTimeout(timeout);
                reject(reason);
            }
            function doResolve() {
                chromaProcess.stdout!.removeListener('data', onStdoutData);
                chromaProcess.stderr!.removeListener('data', onStderrData);
                chromaProcess.removeListener('error',onError);
                //chromaProcess.removeListener('exit',onClose);
                clearTimeout(timeout);
                resolve();
            }

            timeout = setTimeout(()=> {
                // Instance did not start within the time limit
                doReject(new Error(`Instance ${instanceName(userId)} did not launch within ${Config.DB_TIMEOUT} ms.`))
            },Config.DB_TIMEOUT);

            const onStdoutData = (data: Buffer) => {
                const message: string = data.toString();
                if (message.includes(DB_LAUNCH_SUCCESS_INDICATOR)) {
                    // as of version 0.4.22, this message signals a successful startup
                    logger.debug(Log.Type.InstanceReady,'Instance is ready',Log.Context.InstanceExtended,undefined,userId);
                    doResolve();
                }
            };

            const onStderrData = (data: Buffer) => {
                stderrOut += data;
            };

            const onClose = (code: number | null) => {
                if (code !== 0) {
                    doReject(new Error(`Instance ${instanceName(userId)} closed with code ${code}:\n ${stderrOut}`));
                } else {
                    logger.debug(Log.Type.InstanceShutdown,'Instance shut down.',Log.Context.Instance,null,userId);
                    doReject();
                }
            };

            const onError = (err: Error) => {
                logger.error(Log.Type.InstanceSpawnError,'Failed to spawn instance',Log.Context.Instance,err,userId);
                doReject(err);
            };
            
            if (!chromaProcess.stdout) return;
            if (!chromaProcess.stderr) return;

            chromaProcess.stdout.on('data', onStdoutData);
            chromaProcess.stderr.on('data', onStderrData);
            chromaProcess.on('error', onError);
            chromaProcess.on('exit', onClose);
        });

        const instance = instances.get(userId);
        if (instance) {
            instance.ready = true;
        }

        return port;

    } catch (error) {
        logger.error(Log.Type.InstanceStartError,'Failed to start instance',Log.Context.InstanceExtended,error);
        if (timeout) clearTimeout(timeout);
        await terminateInstance(userId);
        throw error;
    }
}

// Terminate ChromaDB instance for the given user
async function terminateInstance(userId:UUID): Promise<void> {
    if (userId) {
        if (instances.has(userId)) {
            const instance = instances.get(userId)!;
            if (!instance.process.killed) {
                return new Promise((resolve) => {
                    instance.process.once('exit', () => { 
                        instances.delete(userId);
                        resolve();
                    });
                    instance.process.kill();
                });
            }
            instances.delete(userId);
        }
    }
}

// Retrieve a single instance that has been idle the longest and for more than DB_TTL_CONGESTED ms.
function getTerminableInstance(): { userId: UUID; lastActive: number } | null {

    let oldestInstance: { userId: UUID; lastActive: number } | null = null;

    instances.forEach((instance, userId) => {
        const idleTime = Date.now() - instance.lastActive;
        if (!oldestInstance || (idleTime > oldestInstance.lastActive && idleTime > Config.DB_TTL_CONGESTED)) {
            oldestInstance = { userId, lastActive: instance.lastActive };
        }
    });
    return oldestInstance;
}

// Terminate ChromaDB instances that have been idle for DB_TTL ms or longer
export function checkAndTerminateExpiredInstances() {
    const now = Date.now();
    instances.forEach((instance, userId) => {
        if (now - instance.lastActive > Config.DB_TTL) {
            logger.debug(Log.Type.InstanceInactivityShutdown,'Instance shutting down due to inactivity',Log.Context.InstanceExtended,undefined,userId);
            terminateInstance(userId).then(() => {
                // Attempt to process the queue after terminating an instance
                processQueue();
            }).catch((error) => {
                logger.error(Log.Type.InstanceTerminationError,'Failed to terminate expired instance',Log.Context.InstanceExtended,error,userId);
            });
        }
    });
    // Perform the next check in 1 minute
    setTimeout(checkAndTerminateExpiredInstances, 60000);
}

export function clearQueue(reason:string) {
    // Clear queue timeouts and reject promises
    queue.forEach(entry => {
        clearTimeout(entry.timeoutHandle);
        entry.reject(new Error(reason));
    });
}

// Add instance start for a user to the queue
export async function enqueueInstanceStart(userId: UUID): Promise<number> {
    let entry = queue.get(userId);
    if (entry) {
        // User is already awaiting an instance, return the existing promise for this user
        return entry.promise;
    }
    let resolve: (port: number) => void;
    let reject: (reason?: any) => void;

    const promise = new Promise<number>((res, rej) => {
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
        resolve: resolve!,
        reject: reject!,
        timeoutHandle,
    };

    // Add the userId and corresponding queue entry to the map
    queue.set(userId,entry);

    // Immediately attempt to process the queue if under max capacity
    processQueue();

    return promise;
}
  
// Process the queue when possible
function processQueue() {

    const freemem:number = os.freemem();

    if (instances.size >= Config.MAX_INSTANCES || freemem < Config.DB_MINMEMORY) {

        // We hit MAX_INSTANCES or memory threshold, try freeing up an idle instance

        if (instances.size === Config.MAX_INSTANCES) {
            const now = Date.now();
            if (maxInstancesTimestamp === null || (now - maxInstancesTimestamp) > Config.MAX_INSTANCES_LOG_COOLDOWN) {
                logger.info(Log.Type.InstanceCreationMaxInstances,`Amount of ChromaDB instances exceeds ${Config.MAX_INSTANCES}.`,Log.Context.Instance);
                maxInstancesTimestamp = now;
            }
        }

        if (freemem < Config.DB_MINMEMORY) {
            logger.warn(Log.Type.InstanceCreationMaxMemory,`Available memory lower than ${Config.DB_MINMEMORY} kb`,Log.Context.Instance|Log.Context.Instances);
        }

        const oldestInstanceInfo = getTerminableInstance();
        if (oldestInstanceInfo) {
            terminateInstance(oldestInstanceInfo.userId).then(() => {
                // Attempt to process the queue after terminating the oldest idle instance
                processQueue();
            }).catch(error => {
                return; // Exit the function to wait for an instance to terminate normally
            });
        } else {
            return; // Exit the function to wait for an instance to terminate
        }
    } else {
        maxInstancesTimestamp = null;
    }

    if (queue.size > 0) {

        // Process the next entry in the queue, if any

        const queueEntry = queue.entries().next().value;
        if (!queueEntry) {
            logger.error(Log.Type.Unexpected,'Next queue entry expected, but not found.');
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
        if (fs.existsSync(Config.DB_PATH)) {
            fs.accessSync(Config.DB_PATH,fs.constants.R_OK|fs.constants.W_OK);  // Test if we can read and write the database directory
        } else {
            fs.mkdirSync(Config.DB_PATH,{recursive:true,mode: 0o750 });         // Create database directory with rwxr-x--- permissions
            logger.info(Log.Type.DatabasePathCreation,`Created database directory ${Config.DB_PATH}.`);
        }
    } catch(error) {
        logger.fatal(Log.Type.DatabasePathError,`Can not read or write database directory '${Config.DB_PATH}'`,undefined,error);
        process.exit(1);
    }
})();