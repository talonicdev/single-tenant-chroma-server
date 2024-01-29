import fs from 'fs';
import path from 'node:path';
import 'dotenv/config';
import yargs, { Argv } from 'yargs';
import { hideBin } from 'yargs/helpers';
import YAML from 'yaml';
import { ServerOptionsArgs, ServerOptionsYml } from './types';

console.log('---------------------------------');

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
    console.log("No config.yml provided.");
}
if (configFile) {
    try {
        yamlConfig = YAML.parse(configFile);
        console.log('Config.yml successfully parsed.');
    } catch(error) {
        console.error({
            event: 'ConfigError',
            message: `Error while parsing config.yml: ${error}.`
        });
        throw new Error('config.yml invalid.');
    }
}
// Resolve possible relative path to absolute ones
function resolvePath(anyPath:string) {
    if (anyPath) {
        return path.resolve(anyPath) || "";
    }
    return "";
}
function isTruthy(val?:boolean|string|number):boolean {
    return val === true || val === 'true' || val === 'TRUE' || val === '1' || val === 1;
}
// Resolve order of precendence for boolean settings
function resolveBool(arg?:boolean|string,yml?:boolean,env?:string,defaultValue:boolean=false):boolean {
    if (arg !== undefined) return isTruthy(arg);
    if (yml !== undefined) return yml;
    if (env !== undefined) return isTruthy(env);
    return defaultValue;
}
function getEnableSSL():boolean {
    // Command line args override potential web server settings
    if (argv.enableSSL !== undefined) return isTruthy(argv.enableSSL);
    // Test if a web server performing SSL handshakes is used
    if (["apache", "nginx"].includes(yamlConfig.webServerType || '')) {
        console.warn("Warning: SSL is enabled but is handled by a web server. Remove 'webServerType' from 'config.yml' or pass 'enableSSL' command line argument to enable it here.");
        return false;
    }
    return resolveBool(undefined,yamlConfig.enableSSL,process.env.ENABLE_SSL,false);
}
function getEnablePortBinding():boolean {
    // Command line args override potential docker settings
    if (argv.bindToLocalhost !== undefined) return isTruthy(argv.bindToLocalhost);
    // Test is a Docker container requires an exposed port
    if (yamlConfig.useDocker) {
        console.warn("Warning: Port binding to 127.0.0.1 is enabled but is handled by Docker. Remove 'useDocker' from 'config.yml' or pass 'bindToLocalhost' command line argument to enable it here.");
        return false;
    }
    return resolveBool(undefined,undefined,process.env.BIND_LOCALHOST,false);
}

// Populate settings from args, config file, env or defaults
export const APP_PORT: number          = argv.port || yamlConfig.appPort || parseInt(process.env.APP_PORT || "8080");
export const AUTH_SERVER_URL: string   = argv.authServerEndpoint || yamlConfig.authServerEndpoint || process.env.AUTH_SERVER_ENDPOINT || "";
export const AUTH_SERVER_KEY: string   = argv.authServerAPIKey || yamlConfig.authServerAPIKey || process.env.AUTH_SERVER_APIKEY || "";
export const DB_PATH: string           = resolvePath(argv.dbPath || yamlConfig.dbPath || process.env.DB_PATH || "./chromadb");
export const DB_TTL: number            = argv.dbTTL || yamlConfig.dbTTL || parseInt(process.env.DB_TTL || "180000");
export const MAX_INSTANCES: number     = argv.dbMaxInstances || yamlConfig.dbMaxInstances || parseInt(process.env.DB_MAX_INSTANCES || "100");
export const ADMIN_API_KEY: string     = argv.adminAPIKey || yamlConfig.adminAPIKey || process.env.ADMIN_API_KEY || "";
export const LOGFILE: string           = resolvePath(argv.logFile || yamlConfig.logFile || process.env.LOG_FILE || "");
export const LOGLEVEL: string          = argv.logLevel || yamlConfig.logLevel || process.env.LOG_LEVEL || "info";
export const QUEUE_TIMEOUT: number     = argv.queueTimeout || yamlConfig.queueTimeout || parseInt(process.env.QUEUE_TIMEOUT || '300000');
export const MAX_RETRIES: number       = argv.dbMaxRetries || yamlConfig.dbMaxRetries || parseInt(process.env.DB_MAX_RETRIES || '2');
export const BIND_LOCALHOST: boolean   = getEnablePortBinding();
export const ENABLE_SSL: boolean       = getEnableSSL();
export const CERT_FILE: string         = argv.sslCertFile || yamlConfig.sslCertFile || process.env.SSL_CERT_FILE || '';
export const CERT_KEY_FILE: string     = argv.sslCertKeyFile || yamlConfig.sslCertKeyFile || process.env.SSL_CERT_KEY_FILE || '';

// (As of yet) Non-configurable settings
export const DB_TTL_CONGESTED: number = Math.min(30000,DB_TTL);    // ChromaDB TTL for oldest idle instances if MAX_INSTANCES has been exceeded
export const DB_TIMEOUT:number = 20000;                            // Maximum amount of ms before attempt to launch instance is aborted
export const DB_MINMEMORY:number = 1000 * 1000 * 500;              // Minimum bytes of free memory required for instance creation
export const MAX_INSTANCES_LOG_COOLDOWN:number = 60000;            // Time in ms between warnings about MAX_INSTANCES being exceeded

if (!BIND_LOCALHOST && !ENABLE_SSL) {
    try {
        if (!fs.existsSync('/.dockerenv')) {
            console.warn(`Warning: The current settings seem to be unsecure. Ensure that the app can't be accessed remotely without SSL.`);
        }
    } catch(error) {}
}

// Summarize the configuration on startup
console.log(`

Starting with configuration:

 - Port: ${APP_PORT}
 - Bind to 127.0.0.1: ${BIND_LOCALHOST?'Yes':'No'}
 - Auth Server URL: ${AUTH_SERVER_URL||'None'}
 - Auth Server API-Key: ${AUTH_SERVER_KEY.length?String('*').repeat(AUTH_SERVER_KEY.length):'None'}
 - Admin API-Key: ${ADMIN_API_KEY.length?String('*').repeat(ADMIN_API_KEY.length):'None'}
 - Database Path: ${DB_PATH}
 - ChromaDB TTL: ${DB_TTL} ms
 - Max Instances: ${MAX_INSTANCES}
 - Queue Timeout: ${QUEUE_TIMEOUT} ms
 - Max Retries: ${MAX_RETRIES}
 - Log Output: ${LOGFILE ? LOGFILE : "stdout/stderr"}
 - Log Level: ${LOGLEVEL}
 - Enable SSL: ${ENABLE_SSL?'Yes':'No'}
 - SSL Certificate File: ${CERT_FILE}
 - SSL Certificate Key File: ${CERT_KEY_FILE}

 ---------------------------------
`);