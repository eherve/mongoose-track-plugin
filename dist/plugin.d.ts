import { ClientSession, Schema, Types } from 'mongoose';
export type UpdatedData<T> = FieldUpdateInfo<T> & {
    itemId: Types.ObjectId;
    metadata?: any;
};
export type OnUpdate<T = any> = (updated: {
    _id: Types.ObjectId;
    path: string;
    update: UpdatedData<T>;
}[], session: ClientSession | null) => Promise<any>;
export type TrackFieldOptions<T> = boolean | {
    origin?: () => any;
    onUpdate?: OnUpdate<T>;
    metadata?: any;
    historizeCol?: string;
    historizeField?: string;
};
declare module 'mongoose' {
    interface Schema {
        options?: SchemaOptions;
    }
    interface MongooseBulkWriteOptions {
        skipTrackPlugin?: boolean;
        origin?: any;
    }
    interface SchemaTypeOptions<T, EnforcedDocType = any> {
        track?: TrackFieldOptions<T>;
    }
}
export interface IHistorize<T> {
    entityId: Types.ObjectId;
    itemId?: Types.ObjectId;
    path: string;
    start: Date;
    value?: T;
    end: Date | null;
    previousValue?: T;
    nextValue?: T;
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
    origin?: () => any;
    metadata?: any;
};
export declare const trackPlugin: (schema: Schema, options?: TrackPluginOptions) => void;
