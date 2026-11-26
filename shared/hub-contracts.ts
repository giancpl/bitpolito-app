import {z} from 'zod';
import {profileSchema,resourceSchema,pubkeySchema} from './contracts';
export const HUB_VERSION=1 as const;
export const HUB_KIND=78;
export const HUB_NAMESPACE='bitpolito.hub.v1';
export const operationTypes=['profile','presence','ring','offer','release','inside','cancel','resource','snapshot','member-reset'] as const;
export const hubOperationSchema=z.strictObject({
 version:z.literal(HUB_VERSION),id:z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),team:z.string().min(1).max(128),
 device:z.string().min(1).max(128),sequence:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
 revision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),createdAt:z.number().int().nonnegative(),
 type:z.enum(operationTypes),data:z.record(z.string(),z.unknown())
});
export type HubOperation=z.infer<typeof hubOperationSchema>;
export interface AuthenticatedHubOperation extends HubOperation {author:string;adminAtReceipt:boolean}
export const joinApplicationSchema=z.object({id:z.string(),pubkey:pubkeySchema,name:z.string(),status:z.enum(['pending','approved','declined']),createdAt:z.number().optional()});
export type JoinApplication=z.infer<typeof joinApplicationSchema>;
export const hubSnapshotSchema=z.object({resources:z.array(resourceSchema.extend({id:z.string(),icon:z.string(),revision:z.number().optional()})).max(500),profiles:z.array(profileSchema.extend({id:pubkeySchema})).max(500)});
export type HubConnectionState='connected'|'syncing'|'reconnecting'|'paused'|'simulator';
