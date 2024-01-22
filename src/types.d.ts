import { string } from "yargs";

export type UUID = string;

export interface ServerOptionsArgs {
    port?: number;
    authServerEndpoint?: string;
    authServerAPIKey?: string;
    dbPath?: string;
    dbTTL?: number;
}

export interface ServerOptionsYml {
    appPort?: number;
    authServerEndpoint?: string;
    authServerAPIKey?: string;
    dbPath?: string;
    dbTTL?: number;
}

export interface ChromaDbInstance {
    port: number;
    lastActive: number;
    process: ChildProcess;
}

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

export interface JWTToken {

}