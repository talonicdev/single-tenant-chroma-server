"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.Log = void 0;
const pino_1 = __importDefault(require("pino"));
const os_1 = __importDefault(require("os"));
const pidusage_1 = __importDefault(require("pidusage"));
const config_1 = require("./config");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const LOG_LEVEL_VALUE = pino_1.default.levels.values[config_1.LOGLEVEL.trim().toLowerCase()] || pino_1.default.levels.values['debug'] || 0;
// Ensure existence of log path before creating pino instance
if (config_1.LOGFILE) {
    try {
        if (node_fs_1.default.existsSync(config_1.LOGFILE)) {
            // log file exists, test if we can read and write it
            node_fs_1.default.accessSync(config_1.LOGFILE, node_fs_1.default.constants.R_OK | node_fs_1.default.constants.W_OK);
        }
        else {
            // log file does not exist, create directory if necessary and check permissions
            const dirname = node_path_1.default.dirname(config_1.LOGFILE);
            if (node_fs_1.default.existsSync(dirname)) {
                node_fs_1.default.accessSync(dirname, node_fs_1.default.constants.R_OK | node_fs_1.default.constants.W_OK);
            }
            else {
                node_fs_1.default.mkdirSync(dirname, { recursive: true, mode: 0o750 });
            }
            console.log(`Created log directory ${dirname}.`);
        }
    }
    catch (error) {
        console.error(`Log file ${config_1.LOGFILE} can not be written: ${error}`);
        process.exit(1);
    }
}
const options = {
    formatters: {
        level(label, number) { return { level: number, severity: label }; },
        bindings(binding) { return {}; },
        log(data) { return data; }
    },
    level: 'trace' // levels will be handled here, not by pino, so we log everything we pass to it
};
const destinationOptions = {
    sync: false,
    mkdir: true,
    dest: config_1.LOGFILE || undefined
};
const destination = pino_1.default.destination(destinationOptions);
const pinologger = (0, pino_1.default)(options, destination);
// Default log levels
const logLevels = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60
};
var Log;
(function (Log) {
    // Available Log Types
    let Type;
    (function (Type) {
        Type[Type["AppStart"] = 0] = "AppStart";
        Type[Type["AppShutdown"] = 1] = "AppShutdown";
        Type[Type["Unknown"] = 2] = "Unknown";
        Type[Type["Unexpected"] = 3] = "Unexpected";
        Type[Type["DatabasePathError"] = 4] = "DatabasePathError";
        Type[Type["DatabasePathCreation"] = 5] = "DatabasePathCreation";
        Type[Type["TerminateAllInstances"] = 6] = "TerminateAllInstances";
        Type[Type["TerminateAllInstancesError"] = 7] = "TerminateAllInstancesError";
        Type[Type["AppExit"] = 8] = "AppExit";
        Type[Type["AppExitAfterTermination"] = 9] = "AppExitAfterTermination";
        Type[Type["AppExitRedundant"] = 10] = "AppExitRedundant";
        Type[Type["ProxyError"] = 11] = "ProxyError";
        Type[Type["LogPathCreation"] = 12] = "LogPathCreation";
        Type[Type["ServerStart"] = 13] = "ServerStart";
        Type[Type["ServerListening"] = 14] = "ServerListening";
        Type[Type["ServerShutdown"] = 15] = "ServerShutdown";
        Type[Type["ServerSSLCertPathError"] = 16] = "ServerSSLCertPathError";
        Type[Type["ServerSSLCertReadError"] = 17] = "ServerSSLCertReadError";
        Type[Type["RequestStart"] = 18] = "RequestStart";
        Type[Type["RequestValidated"] = 19] = "RequestValidated";
        Type[Type["RequestFinished"] = 20] = "RequestFinished";
        Type[Type["RequestFailed"] = 21] = "RequestFailed";
        Type[Type["RequestIsHealthCheck"] = 22] = "RequestIsHealthCheck";
        Type[Type["RequestIsAdmin"] = 23] = "RequestIsAdmin";
        Type[Type["RequestNoAdminEndpoint"] = 24] = "RequestNoAdminEndpoint";
        Type[Type["RequestAdminForbidden"] = 25] = "RequestAdminForbidden";
        Type[Type["RequestNoToken"] = 26] = "RequestNoToken";
        Type[Type["RequestForbidden"] = 27] = "RequestForbidden";
        Type[Type["RequestHasInstance"] = 28] = "RequestHasInstance";
        Type[Type["RequestProxyError"] = 29] = "RequestProxyError";
        Type[Type["RequestValidationError"] = 30] = "RequestValidationError";
        Type[Type["InstanceSpawn"] = 31] = "InstanceSpawn";
        Type[Type["InstanceInitializing"] = 32] = "InstanceInitializing";
        Type[Type["InstanceReady"] = 33] = "InstanceReady";
        Type[Type["InstanceShutdown"] = 34] = "InstanceShutdown";
        Type[Type["InstanceCreationMaxMemory"] = 35] = "InstanceCreationMaxMemory";
        Type[Type["InstanceCreationMaxInstances"] = 36] = "InstanceCreationMaxInstances";
        Type[Type["InstanceStartError"] = 37] = "InstanceStartError";
        Type[Type["InstanceSpawnError"] = 38] = "InstanceSpawnError";
        Type[Type["InstanceStartMaxRetries"] = 39] = "InstanceStartMaxRetries";
        Type[Type["InstanceInactivityShutdown"] = 40] = "InstanceInactivityShutdown";
        Type[Type["InstanceTerminationError"] = 41] = "InstanceTerminationError";
    })(Type = Log.Type || (Log.Type = {}));
    ;
    // Additional information to retrieve and include in log entries
    let Context;
    (function (Context) {
        Context[Context["App"] = 1] = "App";
        Context[Context["AppExtended"] = 2] = "AppExtended";
        Context[Context["Request"] = 4] = "Request";
        Context[Context["RequestExtended"] = 8] = "RequestExtended";
        Context[Context["Instance"] = 16] = "Instance";
        Context[Context["InstanceExtended"] = 32] = "InstanceExtended";
        Context[Context["Instances"] = 64] = "Instances"; // 64 => { count, memMb, memMbAvailable, ports }
    })(Context = Log.Context || (Log.Context = {}));
})(Log || (exports.Log = Log = {}));
var logger;
(function (logger) {
    // Functions to be set from outside this module; enables us to retrieve instance or request information without circular imports
    let requestRetrievalFnc = null;
    let instanceRetrievalFnc = null;
    let instancesRetrievalFnc = null;
    // Retrieval function setters; context will be omitted if not set at log time
    function setRequestRetriever(reqRetFnc) {
        requestRetrievalFnc = reqRetFnc;
    }
    logger.setRequestRetriever = setRequestRetriever;
    function setInstanceRetriever(intRetFnc) {
        instanceRetrievalFnc = intRetFnc;
    }
    logger.setInstanceRetriever = setInstanceRetriever;
    function setInstancesRetriever(intRetFnc) {
        instancesRetrievalFnc = intRetFnc;
    }
    logger.setInstancesRetriever = setInstancesRetriever;
    // Context getters
    async function getRequest() {
        if (requestRetrievalFnc) {
            return requestRetrievalFnc();
        }
        return null;
    }
    async function getInstance(userId) {
        if (instanceRetrievalFnc) {
            return instanceRetrievalFnc(userId);
        }
        return null;
    }
    async function getInstances() {
        if (instancesRetrievalFnc) {
            return instancesRetrievalFnc();
        }
        return null;
    }
    // Assemble the non-standard log object
    async function getLogObj(type, context, error, userId, ...additionalProperties) {
        const baseLog = {
            type: Log.Type[type]
        };
        try {
            if (context !== undefined) {
                baseLog.ctx = {};
                // App related context
                if (context & Log.Context.App || context & Log.Context.AppExtended) {
                    baseLog.ctx.app = { pid: process.pid };
                    if (context & Log.Context.AppExtended) {
                        const stats = await (0, pidusage_1.default)(process.pid);
                        Object.assign(baseLog.ctx.app, {
                            hostname: os_1.default.hostname(),
                            startedAt: process.uptime(),
                            memKb: Math.round(stats.memory / 1000),
                            memKbAvailable: Math.round(os_1.default.freemem() / 1000)
                        });
                    }
                }
                let request = null;
                // Request related context
                if (context & Log.Context.Request || context & Log.Context.RequestExtended) {
                    request = await getRequest();
                    if (request) {
                        baseLog.ctx.req = {
                            id: request.id,
                            userId: request.userId
                        };
                        if (context & Log.Context.RequestExtended) {
                            Object.assign(baseLog.ctx.req, {
                                method: request.method,
                                url: request.url,
                                ip: request.ip,
                                startedAt: request.startedAt
                            });
                        }
                    }
                }
                // Instance related context
                if (context & Log.Context.Instance || context & Log.Context.InstanceExtended) {
                    // Retrieve the user ID from param, previous request context or try to get
                    if (!userId) {
                        if (!request) {
                            request = await getRequest();
                        }
                        if (request) {
                            userId = request.userId;
                        }
                    }
                    if (userId) {
                        const instance = await getInstance(userId);
                        if (instance) {
                            baseLog.ctx.instance = {
                                userId: userId,
                                port: instance.port,
                            };
                            if (context & Log.Context.InstanceExtended) {
                                const stats = await (0, pidusage_1.default)(instance.process.pid);
                                Object.assign(baseLog.ctx.instance, {
                                    pid: instance.process.pid,
                                    memKb: Math.round(stats.memory / 1000),
                                    startedAt: instance.startedAt,
                                    lastActive: instance.lastActive,
                                    attempt: instance.attempt,
                                });
                            }
                        }
                    }
                }
                // Context for combined instance statistics, use with care
                if (context & Log.Context.Instances) {
                    const instanceInfo = {
                        count: 0,
                        memMb: 0,
                        ports: [],
                        memMbAvailable: Math.floor(os_1.default.freemem() / 1000000)
                    };
                    const instances = await getInstances();
                    if (instances) {
                        instances.forEach(async (instance) => {
                            const stat = await (0, pidusage_1.default)(instance.process.pid);
                            instanceInfo.count++;
                            instanceInfo.memMb += stat.memory;
                            instanceInfo.ports.push(instance.port);
                        });
                    }
                    instanceInfo.memMb = Math.round(instanceInfo.memMb / 1000000);
                    baseLog.ctx.instances = instanceInfo;
                }
            }
            // Add error, if any
            if (error) {
                baseLog.error = error instanceof Error ? error.stack : error; // Stack is more informative
            }
            // Add additional properties to the log object
            additionalProperties.forEach(props => {
                Object.assign(baseLog, props);
            });
            return baseLog;
        }
        catch (error) {
            return {
                type: Log.Type.Unknown,
                error: (error instanceof Error ? error.stack : error)
            };
        }
    }
    // extensive trace information; for completion's sake; currently neither used nor written to the log
    async function trace(type, message, context, error, userId, ...additionalProperties) {
        if (LOG_LEVEL_VALUE > logLevels.trace)
            return;
        const data = await getLogObj(type, context, error, userId, ...additionalProperties);
        pinologger.trace(data, message);
    }
    logger.trace = trace;
    // debug information; currently not actually written to the log
    async function debug(type, message, context, error, userId, ...additionalProperties) {
        if (LOG_LEVEL_VALUE > logLevels.debug)
            return;
        const data = await getLogObj(type, context, error, userId, ...additionalProperties);
        pinologger.debug(data, message);
    }
    logger.debug = debug;
    // misc information and process logs, includes most standard processes
    async function info(type, message, context, error, userId, ...additionalProperties) {
        if (LOG_LEVEL_VALUE > logLevels.info)
            return;
        const data = await getLogObj(type, context, error, userId, ...additionalProperties);
        pinologger.info(data, message);
    }
    logger.info = info;
    // explicit warnings that may require attention but won't influence the app's normal operations
    async function warn(type, message, context, error, userId, ...additionalProperties) {
        if (LOG_LEVEL_VALUE > logLevels.warn)
            return;
        const data = await getLogObj(type, context, error, userId, ...additionalProperties);
        pinologger.warn(data, message);
    }
    logger.warn = warn;
    // errors that require attention and may influence the app's normal operations
    async function error(type, message, context, error, userId, ...additionalProperties) {
        if (LOG_LEVEL_VALUE > logLevels.error)
            return;
        const data = await getLogObj(type, context, error, userId, ...additionalProperties);
        pinologger.error(data, message);
    }
    logger.error = error;
    // fatal errors that require immediate attention, and may make normal app operations impossible; usually involves a restart right after
    async function fatal(type, message, context, error, userId, ...additionalProperties) {
        // always log fatal errors
        const data = await getLogObj(type, context, error, userId, ...additionalProperties);
        pinologger.fatal(data, message);
    }
    logger.fatal = fatal;
})(logger || (exports.logger = logger = {}));
