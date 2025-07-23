import { Aggregate, Model, PipelineStage, Schema } from 'mongoose';
export declare function hasQueryFieldUpdate(updates: any, path: string): boolean;
export declare function getAggregateTargetModel(aggregate: Aggregate<any>): Model<any> | null;
export declare function getMergePipelineStage(aggregate: Aggregate<any>): PipelineStage.Merge['$merge'] | null;
export declare function addMergeUpdateStage(aggregate: Aggregate<any>, $set: any): void;
export declare function patchModel(id: string, wrapper: (schema: Schema, model: Model<any>) => void): void;
