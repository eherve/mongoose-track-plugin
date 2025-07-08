import { Schema, Types } from 'mongoose';
declare module 'mongoose' {
    interface Schema {
        options?: SchemaOptions;
    }
    interface MongooseBulkWriteOptions {
        skipTrackPlugin?: boolean;
        origin?: any;
    }
    interface SchemaTypeOptions<T, EnforcedDocType = any> {
        track?: boolean | {
            origin?: any;
            onUpdate?: (updated: {
                _id: string;
                path: string;
                update: UpdatedData<T>;
            }[]) => void;
            metadata?: any;
            historizeCol?: string;
            historizeField?: string;
        };
    }
}
export interface IHistorize<T> {
    entityId: Types.ObjectId;
    itemId?: Types.ObjectId;
    path: string;
    start: Date;
    end: Date | null;
    value?: T;
    previousValue?: T;
    origin?: any;
    metadata?: any;
}
export type FieldUpdateInfo<T> = {
    updatedAt: Date;
    value?: T;
    previousValue?: T;
    origin?: any;
};
export type TrackPluginOptions = {
    logger?: {
        debug: (...args: any) => void;
    };
};
type UpdatedData<T> = FieldUpdateInfo<T> & {
    itemId: Types.ObjectId;
    metadata?: any;
};
export declare const trackPlugin: (schema: Schema) => void;
export {};
