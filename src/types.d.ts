import { string } from "yargs";
import { Level as LogLevel } from 'pino';
import { ChildProcess } from 'child_process';

export type UUID = string;

export interface ServerOptionsArgs {
    port?: number;
    authServerEndpoint?: string;
    authServerAPIKey?: string;
    dbPath?: string;
    dbTTL?: number;
    dbMaxInstances?: number;
    adminAPIKey?: string;
    queueTimeout?: number;
    dbMaxRetries?: number;
    logFile?: string;
    logLevel?: string;
    bindToLocalhost?: boolean|string;
    enableSSL?: boolean|string;
    sslPort?: number;
    sslCertFile?: string;
    sslCertKeyFile?: string;
    webServerType?: string;
    useDocker?: boolean;
}

export interface ServerOptionsYml {
    appPort?: number;
    authServerEndpoint?: string;
    authServerAPIKey?: string;
    dbPath?: string;
    dbTTL?: number;
    dbMaxInstances?: number;
    adminAPIKey?: string;
    queueTimeout?: number;
    dbMaxRetries?: number;
    logFile?: string;
    logLevel?: string;
    bindToLocalhost?: boolean;
    enableSSL?: boolean;
    sslPort?: number;
    sslCertFile?: string;
    sslCertKeyFile?: string;
    webServerType?: string;
    useDocker?: boolean;
}

export interface ChromaDbInstance {
    port: number;
    lastActive: number;
    startedAt: number;
    process: ChildProcess;
    requests: number;
    ready: boolean;
    attempt?: number;
    name?: string;
}

export type QueueEntry = {
    promise: Promise<number>;
    resolve: (port: number) => void;
    reject: (reason?: any) => void;
    timeoutHandle: NodeJS.Timeout;
};

export interface validationDto {
    data?: {
        userId: string;
    };
    userId?: string;
    message?: string;
    error?: any;
    statusCode?: number;
}

export interface ChromaDbInstancesMap {
    [token: string]: ChromaDbInstance;
}

export interface ServerStatsItem {
    from: number;
    to: number;
    instanceStarts: number;
    maxInstances: number;
    requests: number;
    failedRequests: number;
    invalidTokens: number;
    missingTokens: number;
}

export type ServerStats = Array<Array<number>>;
export interface RequestStore {
  id: UUID;
  ip?: string;
  url?: string;
  method?: string;
  startedAt?: number;
  userId?: UUID;
}

export namespace Logger {

    export interface LoggerLogItem extends Record<string,unknown> {
      type?: string;
      message?: string;
      context?: Context;
      [key: string]: unknown;
    }
    export interface InstanceContext {
      userId: string;
      startedAt: number;
      lastActive: number;
      attempt: number;
      requests: number;
      errors: number;
      pid: number;
      port: number;
      mem?: number;
    }
    export interface RequestContext {
      ip: string;
      userAgent: string;
      method: string;
      path: string;
      reqStart: number;
      userId?: string;
    }
    export interface AppContext {
      pid: number;
      mem?: number;
      hostname?: string;
    }
    export type Context = InstanceContext | RequestContext | AppContext | undefined;
    export interface SerializedError {
      type: string;
      message: string;
      stack?: string;
    }
    export interface LogMessage extends Record<string,unknown>  {
      type: string;
      msg: string;
      context?: Context;
      error?: SerializedError | string | undefined;
      [key: string]: unknown;
    }
}