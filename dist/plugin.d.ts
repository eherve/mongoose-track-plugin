import { Schema } from 'mongoose';
export type FieldUpdateInfo<T> = {
    value: T | null;
    previousValue: T | null;
    updatedAt: Date;
    previousUpdatedAt: Date | undefined;
    origin: any;
};
export type TrackPluginOptions = {
    logger?: {
        debug: (...args: any) => void;
    };
};
export declare const trackPlugin: (schema: Schema) => void;
