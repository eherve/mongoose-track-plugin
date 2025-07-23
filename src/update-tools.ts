/** @format */
import * as lodash from 'lodash';
import mongoose, { Aggregate, Model, PipelineStage, Schema } from 'mongoose';

export function hasQueryFieldUpdate(updates: any, path: string): boolean {
  for (let update of (Array.isArray(updates) ? updates : [updates]) as any[]) {
    if (hasUpdateValue(update, path)) return true;
    if (hasUpdateValue(update.$set, path)) return true;
    if (hasUpdateValue(update.$setOnInsert, path)) return true;
    if (hasUpdateValue(update.$addFields, path)) return true;
    if (hasUpdateValue(update.$inc, path)) return true;
    if (hasUpdateValue(update.$pull, path)) return true;
    if (hasUpdateValue(update.$push, path)) return true;
  }
  return false;
}

function hasUpdateValue(obj: any, path: string): boolean {
  if (!obj) return false;
  if (obj[path] !== undefined) return true;
  if (lodash.get(obj, path) !== undefined) return true;

  const found = lodash.find(lodash.keys(obj), key => {
    const stripKey = lodash.replace(key, /\.\$(\[[^\]]*\])?/g, '');
    if (lodash.startsWith(path, stripKey)) return true;
    if (lodash.startsWith(stripKey, `${path}.`)) return true;
  });
  if (found) return true;

  const chunks = lodash.split(path, '.');
  for (let i = chunks.length - 1; i >= 0; --i) {
    const subpath = chunks.slice(0, i).join('.');
    if (obj[subpath] !== undefined) return true;
  }
  return false;
}

export function getAggregateTargetModel(aggregate: Aggregate<any>): Model<any> | null {
  const $merge = getMergePipelineStage(aggregate);
  if (!$merge) return null;
  const collectionName = typeof $merge.into === 'string' ? $merge.into : $merge.into.coll;
  const model = aggregate.model();
  const modelName = lodash.find(model.db.modelNames(), modelName => {
    return model.db.models[modelName].collection.collectionName === collectionName;
  });
  const targetModel = modelName ? model.db.models[modelName] : null;
  return targetModel;
}

export function getMergePipelineStage(aggregate: Aggregate<any>): PipelineStage.Merge['$merge'] | null {
  const pipeline = aggregate.pipeline();
  const $merge: PipelineStage.Merge['$merge'] = (lodash.last(pipeline) as any).$merge;
  return $merge ?? null;
}

export function addMergeUpdateStage(aggregate: Aggregate<any>, $set: any) {
  const $merge = getMergePipelineStage(aggregate);
  if (!$merge) return;
  if (typeof $merge.whenMatched === 'string') {
    switch ($merge.whenMatched) {
      case 'merge':
        $merge.whenMatched = [{ $replaceRoot: { newRoot: { $mergeObjects: ['$$ROOT', '$$new'] } } }, { $set }];
        break;
      case 'replace':
        $merge.whenMatched = [{ $replaceRoot: { newRoot: '$$new' } }, { $set }];
        break;
    }
  } else $merge.whenMatched?.push({ $set });
}

function patchModelMethod(prototype: any, flag: string, wrapper: (schema: Schema, model: Model<any>) => void) {
  if (prototype[flag]) return;
  const original = prototype.model;
  prototype.model = function (name: string, schema?: Schema, collection?: string, options?: any) {
    const model = original.call(this, name, schema, collection, options);
    if (schema) wrapper(schema, model);
    return model;
  };
  prototype[flag] = true;
}

export function patchModel(id: string, wrapper: (schema: Schema, model: Model<any>) => void) {
  patchModelMethod(mongoose, `${id}_modelPatched_mongoose`, wrapper);
  patchModelMethod((mongoose as any).Mongoose.prototype, `${id}_modelPatched_global`, wrapper);
  patchModelMethod(mongoose.Connection.prototype, `${id}_modelPatched_conn`, wrapper);
}
