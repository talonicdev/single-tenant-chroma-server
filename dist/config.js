"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_INSTANCES_LOG_COOLDOWN = exports.DB_MINMEMORY = exports.DB_TIMEOUT = exports.DB_TTL_CONGESTED = exports.CERT_KEY_FILE = exports.CERT_FILE = exports.ENABLE_SSL = exports.BIND_LOCALHOST = exports.MAX_RETRIES = exports.QUEUE_TIMEOUT = exports.LOGLEVEL = exports.LOGFILE = exports.ADMIN_API_KEY = exports.MAX_INSTANCES = exports.DB_TTL = exports.DB_PATH = exports.AUTH_SERVER_KEY = exports.AUTH_SERVER_URL = exports.APP_PORT = void 0;
const fs_1 = __importDefault(require("fs"));
const node_path_1 = __importDefault(require("node:path"));
require("dotenv/config");
const yargs_1 = __importDefault(require("yargs"));
const helpers_1 = require("yargs/helpers");
const yaml_1 = __importDefault(require("yaml"));
console.log('---------------------------------');
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
    console.log("No config.yml provided.");
}
if (configFile) {
    try {
        yamlConfig = yaml_1.default.parse(configFile);
        console.log('Config.yml successfully parsed.');
    }
    catch (error) {
        console.error({
            event: 'ConfigError',
            message: `Error while parsing config.yml: ${error}.`
        });
        throw new Error('config.yml invalid.');
    }
}
// Resolve possible relative path to absolute ones
function resolvePath(anyPath) {
    if (anyPath) {
        return node_path_1.default.resolve(anyPath) || "";
    }
    return "";
}
function isTruthy(val) {
    return val === true || val === 'true' || val === 'TRUE' || val === '1' || val === 1;
}
// Resolve order of precendence for boolean settings
function resolveBool(arg, yml, env, defaultValue = false) {
    if (arg !== undefined)
        return isTruthy(arg);
    if (yml !== undefined)
        return yml;
    if (env !== undefined)
        return isTruthy(env);
    return defaultValue;
}
function getEnableSSL() {
    // Command line args override potential web server settings
    if (argv.enableSSL !== undefined)
        return isTruthy(argv.enableSSL);
    // Test if a web server performing SSL handshakes is used
    if (["apache", "nginx"].includes(yamlConfig.webServerType || '')) {
        console.warn("Warning: SSL is enabled but is handled by a web server. Remove 'webServerType' from 'config.yml' or pass 'enableSSL' command line argument to enable it here.");
        return false;
    }
    return resolveBool(undefined, yamlConfig.enableSSL, process.env.ENABLE_SSL, false);
}
function getEnablePortBinding() {
    // Command line args override potential docker settings
    if (argv.bindToLocalhost !== undefined)
        return isTruthy(argv.bindToLocalhost);
    // Test is a Docker container requires an exposed port
    if (yamlConfig.useDocker) {
        console.warn("Warning: Port binding to 127.0.0.1 is enabled but is handled by Docker. Remove 'useDocker' from 'config.yml' or pass 'bindToLocalhost' command line argument to enable it here.");
        return false;
    }
    return resolveBool(undefined, undefined, process.env.BIND_LOCALHOST, false);
}
// Populate settings from args, config file, env or defaults
exports.APP_PORT = argv.port || yamlConfig.appPort || parseInt(process.env.APP_PORT || "8080");
exports.AUTH_SERVER_URL = argv.authServerEndpoint || yamlConfig.authServerEndpoint || process.env.AUTH_SERVER_ENDPOINT || "";
exports.AUTH_SERVER_KEY = argv.authServerAPIKey || yamlConfig.authServerAPIKey || process.env.AUTH_SERVER_APIKEY || "";
exports.DB_PATH = resolvePath(argv.dbPath || yamlConfig.dbPath || process.env.DB_PATH || "./chromadb");
exports.DB_TTL = argv.dbTTL || yamlConfig.dbTTL || parseInt(process.env.DB_TTL || "180000");
exports.MAX_INSTANCES = argv.dbMaxInstances || yamlConfig.dbMaxInstances || parseInt(process.env.DB_MAX_INSTANCES || "100");
exports.ADMIN_API_KEY = argv.adminAPIKey || yamlConfig.adminAPIKey || process.env.ADMIN_API_KEY || "";
exports.LOGFILE = resolvePath(argv.logFile || yamlConfig.logFile || process.env.LOG_FILE || "");
exports.LOGLEVEL = argv.logLevel || yamlConfig.logLevel || process.env.LOG_LEVEL || "info";
exports.QUEUE_TIMEOUT = argv.queueTimeout || yamlConfig.queueTimeout || parseInt(process.env.QUEUE_TIMEOUT || '300000');
exports.MAX_RETRIES = argv.dbMaxRetries || yamlConfig.dbMaxRetries || parseInt(process.env.DB_MAX_RETRIES || '2');
exports.BIND_LOCALHOST = getEnablePortBinding();
exports.ENABLE_SSL = getEnableSSL();
exports.CERT_FILE = argv.sslCertFile || yamlConfig.sslCertFile || process.env.SSL_CERT_FILE || '';
exports.CERT_KEY_FILE = argv.sslCertKeyFile || yamlConfig.sslCertKeyFile || process.env.SSL_CERT_KEY_FILE || '';
// (As of yet) Non-configurable settings
exports.DB_TTL_CONGESTED = Math.min(30000, exports.DB_TTL); // ChromaDB TTL for oldest idle instances if MAX_INSTANCES has been exceeded
exports.DB_TIMEOUT = 20000; // Maximum amount of ms before attempt to launch instance is aborted
exports.DB_MINMEMORY = 1000 * 1000 * 500; // Minimum bytes of free memory required for instance creation
exports.MAX_INSTANCES_LOG_COOLDOWN = 60000; // Time in ms between warnings about MAX_INSTANCES being exceeded
if (!exports.BIND_LOCALHOST && !exports.ENABLE_SSL) {
    try {
        if (!fs_1.default.existsSync('/.dockerenv')) {
            console.warn(`Warning: The current settings seem to be unsecure. Ensure that the app can't be accessed remotely without SSL.`);
        }
    }
    catch (error) { }
}
// Summarize the configuration on startup
console.log(`

Starting with configuration:

 - Port: ${exports.APP_PORT}
 - Bind to 127.0.0.1: ${exports.BIND_LOCALHOST ? 'Yes' : 'No'}
 - Auth Server URL: ${exports.AUTH_SERVER_URL || 'None'}
 - Auth Server API-Key: ${exports.AUTH_SERVER_KEY.length ? String('*').repeat(exports.AUTH_SERVER_KEY.length) : 'None'}
 - Admin API-Key: ${exports.ADMIN_API_KEY.length ? String('*').repeat(exports.ADMIN_API_KEY.length) : 'None'}
 - Database Path: ${exports.DB_PATH}
 - ChromaDB TTL: ${exports.DB_TTL} ms
 - Max Instances: ${exports.MAX_INSTANCES}
 - Queue Timeout: ${exports.QUEUE_TIMEOUT} ms
 - Max Retries: ${exports.MAX_RETRIES}
 - Log Output: ${exports.LOGFILE ? exports.LOGFILE : "stdout/stderr"}
 - Log Level: ${exports.LOGLEVEL}
 - Enable SSL: ${exports.ENABLE_SSL ? 'Yes' : 'No'}
 - SSL Certificate File: ${exports.CERT_FILE}
 - SSL Certificate Key File: ${exports.CERT_KEY_FILE}

 ---------------------------------
`);
