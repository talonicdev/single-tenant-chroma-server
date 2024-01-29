import pino, { LoggerOptions, DestinationStream } from "pino";
import { SonicBoomOpts } from 'sonic-boom';
import os from 'os';
import pidusage from 'pidusage';
import { ChromaDbInstance, RequestStore, UUID } from "./types";
import { LOGFILE, LOGLEVEL } from "./config";
import fs from 'node:fs';
import path from 'node:path';

const LOG_LEVEL_VALUE =   pino.levels.values[LOGLEVEL.trim().toLowerCase()] || pino.levels.values['debug'] || 0;

// Ensure existence of log path before creating pino instance
if (LOGFILE) {
  try {
    if (fs.existsSync(LOGFILE)) {
      // log file exists, test if we can read and write it
      fs.accessSync(LOGFILE,fs.constants.R_OK|fs.constants.W_OK);
    } else {
      // log file does not exist, create directory if necessary and check permissions
      const dirname = path.dirname(LOGFILE);
      if (fs.existsSync(dirname)) {
        fs.accessSync(dirname,fs.constants.R_OK|fs.constants.W_OK);
      } else {
        fs.mkdirSync(dirname,{recursive:true,mode: 0o750 });
      }
      console.log(`Created log directory ${dirname}.`);
    }
  } catch(error) {
    console.error(`Log file ${LOGFILE} can not be written: ${error}`);
    process.exit(1);
  }
}

const options:LoggerOptions = {
  formatters: {
    level(label,number) { return { level: number, severity: label } },
    bindings(binding) { return {} },
    log(data) { return data; }
  },
  level: 'trace'  // levels will be handled here, not by pino, so we log everything we pass to it
};
const destinationOptions:SonicBoomOpts = {
  sync: false,
  mkdir: true,
  dest: LOGFILE || undefined
}
const destination:DestinationStream = pino.destination(destinationOptions);
const pinologger = pino(options,destination);

// Default log levels
const logLevels = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60
};

interface LogMessage {
  type: string;
  ctx?: {
    app?: {
      pid: number;
      hostname?: string;
      startedAt?: number; 
      memKb?: number;
      memKbAvailable?: number;
    },
    req?: {
      id: UUID;
      userId?: UUID;
      method?: string;
      url?: string;
      ip?: string;
      startedAt?: number;
    },
    instance?: {
      userId: UUID;
      port: number;
      lastActive?: number;
      pid?: number;
      memKb?: number;
      startedAt?: number;
      attempt?: number;
    },
    instances?: {
      count: number;
      memMb: number;
      memMbAvailable: number;
      ports: Array<number>;
    }
  };
  error?: unknown;
  [key: string]: unknown;
}
export namespace Log {

  // Available Log Types
  export enum Type {
    AppStart, AppShutdown, Unknown, Unexpected, DatabasePathError, DatabasePathCreation, TerminateAllInstances, TerminateAllInstancesError, AppExit, AppExitAfterTermination, AppExitRedundant, ProxyError, LogPathCreation,
    ServerStart, ServerListening, ServerShutdown, ServerSSLCertPathError, ServerSSLCertReadError,
    RequestStart, RequestValidated, RequestFinished, RequestFailed, RequestIsHealthCheck, RequestIsAdmin, RequestNoAdminEndpoint, RequestAdminForbidden, RequestNoToken, RequestForbidden, RequestHasInstance, RequestProxyError, RequestValidationError,
    InstanceSpawn, InstanceInitializing, InstanceReady, InstanceShutdown, InstanceCreationMaxMemory, InstanceCreationMaxInstances, InstanceStartError, InstanceSpawnError, InstanceStartMaxRetries, InstanceInactivityShutdown, InstanceTerminationError,
  };

  // Additional information to retrieve and include in log entries
  export enum Context {
    App = 1 << 0, // 1 => { pid }
    AppExtended = 1 << 1, // 2 => { pid, hostname, startedAt, memKb, memKbAvailable }
    Request = 1 << 2, // 4 => { id, userId? }
    RequestExtended = 1 << 3, // 8 => { id, userId?, method, url, ip, startedAt }
    Instance = 1 << 4, // 16 => { userId, port }
    InstanceExtended = 1 << 5, // 32 => { userId, port, pid, startedAt, lastActive, memKb, attempt }
    Instances = 1 << 6 // 64 => { count, memMb, memMbAvailable, ports }
  }
}

export namespace logger {

  // Functions to be set from outside this module; enables us to retrieve instance or request information without circular imports
  let requestRetrievalFnc:Function|null = null;
  let instanceRetrievalFnc:Function|null = null;
  let instancesRetrievalFnc:Function|null = null;

  // Retrieval function setters; context will be omitted if not set at log time
  export function setRequestRetriever(reqRetFnc:() => Promise<RequestStore|null>):void {
    requestRetrievalFnc = reqRetFnc;
  }
  export function setInstanceRetriever(intRetFnc:(userId:UUID) => Promise<ChromaDbInstance|null>):void {
    instanceRetrievalFnc = intRetFnc;
  }
  export function setInstancesRetriever(intRetFnc:() => Promise<Array<ChromaDbInstance>>):void {
    instancesRetrievalFnc = intRetFnc;
  }

  // Context getters
  async function getRequest(): Promise<RequestStore|null> {
    if (requestRetrievalFnc) {
      return requestRetrievalFnc();
    }
    return null;
  }
  async function getInstance(userId:UUID): Promise<ChromaDbInstance|null> {
    if (instanceRetrievalFnc) {
      return instanceRetrievalFnc(userId);
    }
    return null;
  }
  async function getInstances(): Promise<Array<ChromaDbInstance>|null> {
    if (instancesRetrievalFnc) {
      return instancesRetrievalFnc();
    }
    return null;
  }

  // Assemble the non-standard log object
  async function getLogObj(
    type: Log.Type,
    context: Log.Context|undefined,
    error?: unknown,
    userId?: UUID,
    ...additionalProperties: Array<Record<string, unknown>>
  ) {
    const baseLog:LogMessage = {
      type: Log.Type[type]
    };
    try {
      if (context !== undefined) {

        baseLog.ctx = {};

        // App related context
        if (context & Log.Context.App || context & Log.Context.AppExtended) {

          baseLog.ctx.app = { pid: process.pid };
    
          if (context & Log.Context.AppExtended) {
            const stats = await pidusage(process.pid);
            Object.assign(baseLog.ctx.app, {
              hostname: os.hostname(),
              startedAt: process.uptime(),
              memKb: Math.round(stats.memory/1000),
              memKbAvailable: Math.round(os.freemem()/1000)
            });
          }

        }
    
        let request:RequestStore|null = null;

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
                const stats = await pidusage(instance.process.pid as number);
                Object.assign(baseLog.ctx.instance, {
                  pid: instance.process.pid,
                  memKb: Math.round(stats.memory/1000),
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
          const instanceInfo:{count:number;memMb:number;ports:Array<number>,memMbAvailable:number} = { 
            count: 0, 
            memMb: 0, 
            ports: [], 
            memMbAvailable: Math.floor(os.freemem() /1000000)
          }
          const instances = await getInstances();
          if (instances) {
            instances.forEach(async (instance) => {
                const stat = await pidusage(instance.process.pid as number);
                instanceInfo.count++;
                instanceInfo.memMb += stat.memory;
                instanceInfo.ports.push(instance.port);
            });
          }
          instanceInfo.memMb = Math.round(instanceInfo.memMb/1000000);
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

    } catch(error) {

      return {
        type: Log.Type.Unknown,
        error: (error instanceof Error ? error.stack : error)
      };

    }
  }

  // extensive trace information; for completion's sake; currently neither used nor written to the log
  export async function trace(type: Log.Type,message: string,context?: Log.Context,error?: unknown,userId?: UUID,...additionalProperties: Array<Record<string, unknown>>) {
    if (LOG_LEVEL_VALUE > logLevels.trace) return;
    const data = await getLogObj(type,context,error,userId,...additionalProperties);
    pinologger.trace(data,message);
  }

  // debug information; currently not actually written to the log
  export async function debug(type: Log.Type,message: string,context?: Log.Context,error?: unknown,userId?: UUID,...additionalProperties: Array<Record<string, unknown>>) {
    if (LOG_LEVEL_VALUE > logLevels.debug) return;
    const data = await getLogObj(type,context,error,userId,...additionalProperties);
    pinologger.debug(data,message);
  }

  // misc information and process logs, includes most standard processes
  export async function info(type: Log.Type,message: string,context?: Log.Context,error?: unknown,userId?: UUID,...additionalProperties: Array<Record<string, unknown>>) {
    
    if (LOG_LEVEL_VALUE > logLevels.info) return;
    const data = await getLogObj(type,context,error,userId,...additionalProperties);
    pinologger.info(data,message);
  }

  // explicit warnings that may require attention but won't influence the app's normal operations
  export async function warn(type: Log.Type,message: string,context?: Log.Context,error?: unknown,userId?: UUID,...additionalProperties: Array<Record<string, unknown>>) {
    if (LOG_LEVEL_VALUE > logLevels.warn) return;
    const data = await getLogObj(type,context,error,userId,...additionalProperties);
    pinologger.warn(data,message);
  }

  // errors that require attention and may influence the app's normal operations
  export async function error(type: Log.Type,message: string,context?: Log.Context,error?: unknown,userId?: UUID,...additionalProperties: Array<Record<string, unknown>>) {
    if (LOG_LEVEL_VALUE > logLevels.error) return;
    const data = await getLogObj(type,context,error,userId,...additionalProperties);
    pinologger.error(data,message);
  }

  // fatal errors that require immediate attention, and may make normal app operations impossible; usually involves a restart right after
  export async function fatal(type: Log.Type,message: string,context?: Log.Context,error?: unknown,userId?: UUID,...additionalProperties: Array<Record<string, unknown>>) {
    // always log fatal errors
    const data = await getLogObj(type,context,error,userId,...additionalProperties);
    pinologger.fatal(data,message);
  }
}