import { Schema, Types } from 'mongoose';
declare module 'mongoose' {
    interface Schema {
        options?: SchemaOptions;
    }
    interface MongooseBulkWriteOptions {
        skipTrackPlugin?: boolean;
        origin?: any;
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
    value: T | null;
    previousValue: T | null;
    updatedAt: Date;
    origin: any;
};
export type TrackPluginOptions = {
    logger?: {
        debug: (...args: any) => void;
    };
};
export declare const trackPlugin: (schema: Schema) => void;
