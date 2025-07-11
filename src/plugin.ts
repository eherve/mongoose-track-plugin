/** @format */

import { updateToPipeline } from '@eherve/mongoose-update-to-pipeline';
import { AsyncLocalStorage } from 'async_hooks';
import * as lodash from 'lodash';
import mongoose, {
  Aggregate,
  AnyBulkWriteOperation,
  CallbackWithoutResultAndOptionalError,
  ClientSession,
  CompileModelOptions,
  FilterQuery,
  Model,
  MongooseBulkWriteOptions,
  Query,
  Schema,
  SchemaType,
  SchemaTypes,
  Types,
  UpdateQuery,
} from 'mongoose';
import { v4 } from 'uuid';
import { addMergeUpdateStage, getAggregateTargetModel, hasQueryFieldUpdate } from './update-tools';

export type UpdatedData<T> = FieldUpdateInfo<T> & { itemId: Types.ObjectId; metadata?: any };

export type OnUpdate<T = any> = (
  updated: { _id: Types.ObjectId; path: string; update: UpdatedData<T> }[],
  session: ClientSession | null
) => Promise<any>;
declare module 'mongoose' {
  interface Schema {
    options?: SchemaOptions;
  }
  interface MongooseBulkWriteOptions {
    skipTrackPlugin?: boolean;
    origin?: any;
  }
  interface SchemaTypeOptions<T, EnforcedDocType = any> {
    track?:
      | boolean
      | {
          origin?: any;
          onUpdate?: OnUpdate<T>;
          metadata?: any;
          historizeCol?: string;
          historizeField?: string;
        };
  }
}

const asyncStorage = new AsyncLocalStorage<{
  model: Model<any>;
  v: string;
  session?: ClientSession | null;
}>();

const _model = mongoose.model;
mongoose.model = function <TSchema extends Schema = any>(
  name: string,
  schema?: TSchema,
  collection?: string,
  options?: CompileModelOptions
): any {
  const model: Model<any> = _model.call(this, name, schema, collection, options) as any;
  if (schema) {
    const create: any = model.create;
    model.create = function (this: Model<any>, doc: any, options?: any) {
      return asyncStorage.run({ model, session: options?.session, v: v4() }, async () =>
        create.call(this, doc, options)
      );
    } as any;
    const insertMany: any = model.insertMany;
    model.insertMany = function (this: Model<any>, doc: any, options?: any) {
      return asyncStorage.run({ model, session: options?.session, v: v4() }, async () =>
        insertMany.call(this, doc, options)
      );
    } as any;
    const bulkWrite = model.bulkWrite;
    model.bulkWrite = function (
      writes: Array<AnyBulkWriteOperation<any>>,
      options?: MongooseBulkWriteOptions & { ordered: false }
    ) {
      return asyncStorage.run({ model, session: options?.session, v: v4() }, async () =>
        bulkWrite.call(this, writes, options)
      );
    };
  }
  return model;
};

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
};

type Field = {
  path: string;
  name: string;
  typeOptions: { type: any; enum?: any[] };
  infoPath: string;
  arrays?: string[];
  origin?: () => any;
  onUpdate?: OnUpdate;
  metadata?: any;
  historizeCol?: string;
  historizeField?: string;
};

export const trackPlugin = function (schema: Schema, options?: TrackPluginOptions) {
  const fields = getSchemaFields(schema, undefined, undefined, options);
  if (!fields.length) return;
  lodash.each(fields, field => addFieldInfoSchemaPath(schema, field));
  registerMiddleWare(schema, fields);
};

function registerMiddleWare(schema: Schema, fields: Field[]) {
  schema.pre('save', async function (this: any, options?: any) {
    lodash.forEach(fields, field => {
      const origin = options?.origin ?? (field.origin ? field.origin() : undefined);
      addInitialValue(this, field.path, asyncStorage.getStore()!.v, origin, field.historizeField);
    });
  });
  schema.post('save', async function (this: any) {
    const store = asyncStorage.getStore();
    if (!store) return;
    await processPostUpdate(fields, store.model, store.v, store.session);
  });

  schema.pre(
    'insertMany',
    async function (this: Model<any>, next: CallbackWithoutResultAndOptionalError, docs: any[], options?: any) {
      if (options?.skipTrackPlugin) return next();
      if (!Array.isArray(docs) || docs.length === 0) return next();
      lodash.forEach(docs, doc =>
        lodash.forEach(fields, field => {
          const origin = options?.origin ?? (field.origin ? field.origin() : undefined);
          addInitialValue(doc, field.path, asyncStorage.getStore()!.v, origin, field.historizeField);
        })
      );
      return next();
    }
  );
  schema.post('insertMany', async function (this: Model<any>) {
    const store = asyncStorage.getStore();
    if (!store) return;
    await processPostUpdate(fields, this, store.v, store.session);
  });

  schema.pre(
    'bulkWrite',
    async function (this: Model<any>, next: CallbackWithoutResultAndOptionalError, operations: any[], options?: any) {
      if (options.skipTrackPlugin) return next();
      lodash.each(operations, operation => {
        let block: any;
        if (operation.updateOne) block = operation.updateOne;
        else if (operation.updateMany) block = operation.updateMany;
        else return;
        const update = consolidateUpdate(
          fields,
          asyncStorage.getStore()!.v,
          options,
          block.filter,
          block.update,
          block.arrayFilters
        );
        if (!update) return;
        block.update = update;
      });
      next();
    }
  );
  schema.post('bulkWrite', async function (this: Model<any>, res: any) {
    if (!res.modifiedCount && !res.upsertedCount) return;
    await processPostUpdate(fields, this, asyncStorage.getStore()!.v, asyncStorage.getStore()?.session);
  });

  schema.pre(
    ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace'],
    async function (this: Query<any, any>) {
      const options = this.getOptions();
      if (options.skipTrackPlugin) return;
      const queryUpdate = this.getUpdate();
      if (!queryUpdate) return;
      this['trackPluginV'] = this['trackPluginV'] ?? v4();
      const update = consolidateUpdate(
        fields,
        this['trackPluginV'],
        options,
        this.getFilter(),
        this.getUpdate(),
        options.arrayFilters
      );
      if (update) this.setUpdate(update);
    }
  );
  schema.post(['updateOne', 'updateMany'], async function (this: Query<any, any>, res: any) {
    const options = this.getOptions();
    if (options.skipTrackPlugin) return;
    if (!res.modifiedCount && !res.upsertedCount) return;
    await processPostUpdate(fields, this.model, this['trackPluginV'], options.session);
  });

  schema.pre('aggregate', async function (this: Aggregate<any>) {
    if (this.options.skipTrackPlugin) return;
    const targetModel = getAggregateTargetModel(this);
    if (!targetModel) return;
    const fields = getSchemaFields(targetModel?.schema);
    if (!fields.length) return;
    this['trackPluginV'] = this['trackPluginV'] ?? v4();
    addMergeUpdateStage(this, buildSetUpdate(fields, this['trackPluginV'], this.options));
  });

  schema.post('aggregate', async function (this: Aggregate<any>) {
    if (this.options?.skipTrackPlugin) return;
    const targetModel = getAggregateTargetModel(this);
    if (!targetModel) return;
    const fields = getSchemaFields(targetModel?.schema);
    if (!fields.length) return;
    await processPostUpdate(fields, targetModel, this['trackPluginV'], this.options.session);
  });
}

async function processPostUpdate(fields: Field[], model: Model<any>, v: string, session: ClientSession | null = null) {
  const toProcessFields = lodash.filter(fields, field => typeof field.onUpdate === 'function' || !!field.historizeCol);
  if (!toProcessFields.length) return [];
  const data = await getOnUpdateFieldsData(toProcessFields, model, v, session);
  if (!data?.length) return;
  await processOnUpdate(toProcessFields, data, session);
  await processHistorized(toProcessFields, model, data, session);
}

async function processOnUpdate(fields: Field[], data: any[], session: ClientSession | null) {
  for (let field of fields) {
    if (typeof field.onUpdate !== 'function') continue;
    const updated: any = [];
    lodash.each(data, d => {
      const update = lodash.get(d, field.path.replace('.', '_'));
      if (!update || (Array.isArray(update) && update.length === 0)) return;
      updated.push({ _id: d._id, path: field.path, update });
    });
    if (!updated.length) continue;
    if (typeof field.onUpdate === 'function') await field.onUpdate(updated, session);
  }
}

async function processHistorized(
  fields: Field[],
  model: Model<any>,
  data: any[],
  session: ClientSession | null = null
) {
  const bulkInfo: { col: string; operations: AnyBulkWriteOperation<any>[] }[] = [];
  for (let field of fields) {
    if (!field.historizeCol) continue;
    for (let d of data) {
      const update = lodash.get(d, field.path.replace('.', '_'));
      let bi = lodash.find(bulkInfo, { col: field.historizeCol });
      if (!bi) bulkInfo.push((bi = { col: field.historizeCol, operations: [] }));
      if (Array.isArray(update)) {
        lodash.forEach(update, u => bi.operations.push(...buildHistorizeOperation(field, d._id, u)));
      } else bi.operations.push(...buildHistorizeOperation(field, d._id, update));
    }
  }
  if (bulkInfo.length) {
    for (let i of bulkInfo) {
      if (!i.operations.length) continue;
      await model.db.collection(i.col).bulkWrite(i.operations as any, { ordered: true, session: session ?? undefined });
    }
  }
}

function buildHistorizeOperation(field: Field, entityId: any, update: UpdatedData<any>): AnyBulkWriteOperation<any>[] {
  if (!update || !lodash.has(update, 'value')) return [];
  const start = update?.updatedAt ?? new Date();
  const document: IHistorize<any> = { entityId: entityId, path: field.path, start, end: null };
  const filter: FilterQuery<IHistorize<any>> = { entityId: entityId, path: field.path, end: null };
  if (update.itemId !== undefined) document.itemId = filter.itemId = update.itemId;
  if (update.value !== undefined) document.value = update.value;
  if (update.previousValue !== undefined) document.previousValue = update.previousValue;
  if (update.origin !== undefined) document.origin = update.origin;
  if (update.metadata !== undefined) document.metadata = update.metadata;
  return [
    {
      updateOne: {
        filter,
        update: [
          {
            $set: {
              end: start,
              nextValue: document.value,
              duration: { $dateDiff: { startDate: '$start', endDate: start, unit: 'millisecond' } },
            },
          },
        ],
      },
    },
    { insertOne: { document } },
  ];
}

async function getOnUpdateFieldsData(
  fields: Field[],
  model: Model<any>,
  v: string,
  session: ClientSession | null = null
): Promise<any[]> {
  const filter: FilterQuery<any> = { $or: [] };
  const projection: any = {};

  lodash.each(fields, field => {
    filter.$or!.push({ [`${field.infoPath}.v`]: v });
    const chunks = lodash.split(field.infoPath, '.');
    const infoField = lodash.last(chunks);
    const projectionPath = chunks.length > 1 ? lodash.join(lodash.slice(chunks, 0, -1)) : '$ROOT';
    if (field.arrays?.length) {
      if (field.arrays.length > 1) {
        return console.warn(`unmanaged on update trigger on array of array (${field.path})`);
      }
      projection[field.path.replace('.', '_')] = {
        $map: {
          input: {
            $filter: {
              input: `$${projectionPath}`,
              as: 'item',
              cond: { $eq: [`$$item.${infoField}.v`, v] },
            },
          },
          as: 'item',
          in: {
            $mergeObjects: [`$$item.${infoField}`, { itemId: '$$item._id' }, { metadata: field.metadata }],
          },
        },
      };
    } else {
      projection[field.path.replace('.', '_')] = {
        $cond: {
          if: { $eq: [`$${field.infoPath}.v`, v] },
          then: {
            $mergeObjects: [
              `$${field.infoPath}`,
              { itemId: projectionPath !== '$ROOT' ? `$${projectionPath}._id` : null },
              { metadata: field.metadata },
            ],
          },
          else: null,
        },
      };
    }
  });

  const data = await model
    .find(filter, projection)
    .lean<any>()
    .session(session ?? null);
  return data;
}

function addInitialValue(doc: any, path: string, v: string, origin?: any, historizeField?: string) {
  let subDoc = doc;
  const chunks: string[] = lodash.split(path, '.');
  const head = lodash.head(chunks)!;
  if (chunks.length === 1) {
    const updatedAt = new Date();
    subDoc[`${head}Info`] = { value: subDoc[head], updatedAt, origin, v };
    if (historizeField) subDoc[historizeField] = [[updatedAt.valueOf(), subDoc[head], origin]];
  } else if (Array.isArray(subDoc[head])) {
    lodash.forEach(subDoc[head], d =>
      addInitialValue(d, lodash.join(lodash.slice(chunks, 1), '.'), v, origin, historizeField)
    );
  } else if (typeof subDoc[head] === 'object') {
    addInitialValue(subDoc[head], lodash.join(lodash.slice(chunks, 1), '.'), v, origin, historizeField);
  }
}

function buildSetUpdate(fields: Field[], v: string, options: any | undefined): any {
  const $set: any = {};
  lodash.each(fields, field => {
    const origin = options?.origin ?? (field.origin ? field.origin() : undefined);
    lodash.merge($set, buildUpdate(field, v, origin));
  });
  return $set;
}

function consolidateUpdate(
  fields: Field[],
  v: string,
  options: any,
  filter: any,
  update: any,
  arrayFilters?: any[]
): any[] | null {
  const updatedFields = lodash.filter(fields, field => hasQueryFieldUpdate(update, field.path));
  if (!updatedFields.length) return null;
  const $set = buildSetUpdate(updatedFields, v, options);
  if (Array.isArray(update)) {
    update.push({ $set });
    return update;
  }
  const transformedUpdate = updateToPipeline(filter, update, { arrayFilters, disabledWarn: true });
  transformedUpdate.push({ $set });
  return transformedUpdate;
}

function addFieldInfoSchemaPath(schema: Schema, field: Field) {
  const schemaPath = field.path.substring(0, lodash.lastIndexOf(field.path, '.'));
  const info = schema.path(schemaPath);
  if (!schema.path(field.infoPath)) {
    const valueType: any = { type: field.typeOptions.type, index: true };
    if (field.typeOptions.enum) {
      valueType.enum = lodash.cloneDeep(field.typeOptions.enum);
      if (!lodash.includes(valueType.enum, null)) valueType.enum.push(null);
    }
    const type = {
      value: valueType,
      previousValue: valueType,
      updatedAt: { type: Date },
      origin: { type: SchemaTypes.Mixed },
      v: { type: String },
    };
    if (info?.schema) info.schema.path(field.infoPath.substring(schemaPath.length + 1), { type });
    else schema.path(field.infoPath, { type });
  }
  if (field.historizeField && !schema.path(field.historizeField)) {
    const type = [SchemaTypes.Mixed];
    if (info?.schema) info.schema.path(field.historizeField, { type });
    else schema.path(field.historizeField, { type });
  }
}

function getSchemaFields(
  schema: Schema,
  parentPath?: string,
  arrays?: string[],
  options?: TrackPluginOptions
): Field[] {
  const fields: Field[] = [];
  lodash.each(lodash.keys(schema.paths), key => {
    const schemaType = schema.path(key);
    const path = parentPath ? `${parentPath}.${schemaType.path}` : schemaType.path;
    switch (schemaType.instance) {
      case 'Embedded':
        if (schemaType.options?.track) fields.push(buildField(schemaType, key, path, arrays, options));
        else fields.push(...getSchemaFields(schemaType.schema, path, arrays, options));
        break;
      case 'Array':
        if (schemaType.options?.track) fields.push(buildField(schemaType, key, path, arrays, options));
        else if (schemaType.schema) {
          fields.push(...getSchemaFields(schemaType.schema, path, lodash.concat(arrays || [], [key]), options));
        }
        break;
      default:
        if (schemaType.options?.track) fields.push(buildField(schemaType, key, path, arrays, options));
    }
  });

  return fields;
}

function buildField(
  schemaType: SchemaType,
  name: string,
  path: string,
  arrays: string[] | undefined,
  options?: TrackPluginOptions
): Field {
  const field: Field = {
    path,
    name,
    typeOptions: lodash.pick(schemaType.options, 'type', 'enum'),
    infoPath: `${path}Info`,
    arrays,
    origin: schemaType.options.track.origin ?? options?.origin,
    onUpdate: schemaType.options.track.onUpdate,
    metadata: schemaType.options.track.metadata,
    historizeCol: schemaType.options.track.historizeCol,
    historizeField: schemaType.options.track.historizeField,
  };
  return field;
}

function buildUpdate(field: Field, v: string, origin: any): UpdateQuery<any> {
  if (field.arrays?.length) return buildArrayFieldUpdate(field, origin, v);
  return buildFieldUpdate(field, origin, v);
}

function buildArrayFieldUpdate(field: Field, origin: any, v: string): any {
  const last = lodash.last(field.arrays)!;
  const arrayPath = field.path.substring(0, lodash.indexOf(field.path, last) + last.length + 1);
  const valuePath = field.path.substring(arrayPath.length + 1);
  const update: any = {
    [arrayPath]: {
      $map: {
        input: `$${arrayPath}`,
        as: 'elemt',
        in: {
          $cond: {
            if: { $not: { $eq: [`$$elemt.${valuePath}`, `$$elemt.${valuePath}Info.value`] } },
            then: {
              $mergeObjects: [
                '$$elemt',
                {
                  [`${valuePath}Info`]: buildFieldProjection(
                    `$elemt.${valuePath}`,
                    `$elemt.${valuePath}Info`,
                    origin,
                    v
                  ),
                },
              ],
            },
            else: '$$elemt',
          },
        },
      },
    },
  };
  return update;
}

function buildFieldUpdate(field: Field, origin: any, v: string): any {
  const update: any = {
    [field.infoPath]: buildFieldProjection(field.path, field.infoPath, origin, v),
  };
  if (field.historizeField) {
    update[field.historizeField] = buildFieldHistorizedProjection(
      `$${field.historizeField}`,
      field.path,
      field.infoPath,
      origin
    );
  }
  return update;
}

function buildFieldHistorizedProjection(value: string, path: string, infoPath: string, origin: any) {
  const data = [{ $toLong: '$$NOW' }, `$${path}`];
  if (origin) data.push(origin);
  return {
    $concatArrays: [value, { $cond: { if: { $ne: [`$${infoPath}.value`, `$${path}`] }, then: [data], else: [] } }],
  };
}

function buildFieldProjection(path: string, infoPath: string, origin: any, v: string): any {
  return {
    $cond: {
      if: { $ne: [`$${infoPath}.value`, `$${path}`] },
      then: { value: `$${path}`, updatedAt: `$$NOW`, previousValue: `$${infoPath}.value`, origin, v },
      else: `$${infoPath}`,
    },
  };
}
