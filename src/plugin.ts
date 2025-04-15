/** @format */

import { updateToPipeline } from '@eherve/mongoose-update-to-pipeline';
import * as lodash from 'lodash';
import {
  CallbackWithoutResultAndOptionalError,
  FilterQuery,
  Model,
  Query,
  Schema,
  SchemaType,
  SchemaTypes,
  UpdateQuery,
} from 'mongoose';

export type FieldUpdateInfo<T> = {
  value: T | null;
  previousValue: T | null;
  updatedAt: Date;
  previousUpdatedAt: Date | undefined;
  origin: any;
};

export type TrackPluginOptions = {
  logger?: { debug: (...args: any) => void };
};

type Field = {
  path: string;
  name: string;
  typeOptions: { type: any; enum?: any[] };
  infoPath: string;
  arrays?: string[];
  origin?: () => any;
  onUpdate?: <T = any>(updated: { _id: string; update: FieldUpdateInfo<T> }[]) => void;
};

export const trackPlugin = function (schema: Schema) {
  const fields = getTrackSchemaFields(schema);
  if (!fields.length) return;
  lodash.each(fields, field => addFieldInfoSchemaPath(schema, field));
  registerMiddleWare(schema, fields);
};

function registerMiddleWare(schema: Schema, fields: Field[]) {
  schema.pre('save', async function (this: any, next: CallbackWithoutResultAndOptionalError, options?: any) {
    lodash.forEach(fields, field => addInitialValue(this, field.path, options?.origin));
    next();
  });
  schema.post('save', async function (this: Model<any>, data: any, next: CallbackWithoutResultAndOptionalError) {
    lodash.forEach(fields, field => {
      if (typeof field.onUpdate !== 'function') return;
      field.onUpdate([{ _id: data._id, update: lodash.get(data, field.infoPath) }]);
    });
    next();
  });

  schema.pre(
    'insertMany',
    async function (this: Model<any>, next: CallbackWithoutResultAndOptionalError, docs: any[], options?: any) {
      if (!Array.isArray(docs) || docs.length === 0) return next();
      lodash.forEach(docs, doc => lodash.forEach(fields, field => addInitialValue(doc, field.path, options?.origin)));
      next();
    }
  );
  schema.post('insertMany', async function (this: Model<any>, data: any, next: CallbackWithoutResultAndOptionalError) {
    lodash.forEach(fields, field => {
      if (typeof field.onUpdate !== 'function') return;
      field.onUpdate(lodash.map(data, r => ({ _id: r._id, update: lodash.get(r, field.infoPath) })));
    });
    next();
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
        const update = consolidateUpdate(fields, options, block.filter, block.update, block.arrayFilters);
        if (!update) return;
        block.update = update;
      });
      next();
    }
  );
  schema.post('bulkWrite', async function (this: Model<any>, res: any, next: CallbackWithoutResultAndOptionalError) {
    if (!res.modifiedCount && !res.upsertedCount) return next();
    await processOnUpdateFields(fields, this);
    next();
  });

  schema.pre(
    ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace'],
    async function (this: Query<any, any>, next: CallbackWithoutResultAndOptionalError) {
      const queryUpdate = this.getUpdate();
      if (!queryUpdate) return next();

      const options = this.getOptions();
      if (options.skipTrackPlugin) return next();

      const update = consolidateUpdate(fields, options, this.getFilter(), this.getUpdate(), options.arrayFilters);
      if (update) this.setUpdate(update);
      next();
    }
  );

  schema.post(
    ['updateOne', 'updateMany'],
    async function (this: Query<any, any>, res: any, next: CallbackWithoutResultAndOptionalError) {
      const options = this.getOptions();
      if (options.skipTrackPlugin) return next();

      if (!res.modifiedCount && !res.upsertedCount) return next();
      await processOnUpdateFields(fields, this.model);
      next();
    }
  );
}

async function processOnUpdateFields(fields: Field[], model: Model<any>) {
  const fieldsWithOnUpdate = lodash.filter(fields, field => typeof field.onUpdate === 'function');
  if (!fieldsWithOnUpdate.length) return;

  const filter: FilterQuery<any> = { $or: [] };
  const projection: any = {};
  const update: any = { $set: {} };
  lodash.each(fieldsWithOnUpdate, field => {
    filter.$or!.push({ [`${field.infoPath}.triggerOnUpdate`]: true });
    if (field.arrays?.length) {
      const chunks = lodash.split(field.infoPath, '.');
      const path = lodash.reduce(
        chunks,
        (pv, cv) => {
          if (!!pv.length) pv += '.';
          pv += cv;
          if (lodash.find(field.arrays, e => e === cv)) pv += '.$[]';
          return pv;
        },
        ''
      );
      update.$set[`${path}.triggerOnUpdate`] = false;
      projection[field.path.replace('.', '_')] = {
        $filter: { input: `$${field.infoPath}`, as: 'item', cond: { $eq: ['$$item.triggerOnUpdate', true] } },
      };
    } else {
      update.$set[`${field.infoPath}.triggerOnUpdate`] = false;
      projection[field.path.replace('.', '_')] = {
        $cond: { if: { $eq: [`$${field.infoPath}.triggerOnUpdate`, true] }, then: `$${field.infoPath}`, else: null },
      };
    }
  });

  const data = await model.find(filter, projection).lean<any>();
  await model.updateMany(filter, update, { skipTrackPlugin: true });

  lodash.forEach(fieldsWithOnUpdate, field => {
    const updated: any = [];
    lodash.each(data, d => {
      let update = lodash.get(d, field.path.replace('.', '_'));
      if (!update) return;
      if (Array.isArray(update) && update.length === 0) return;
      updated.push({ _id: d._id, update });
    });
    if (!updated.length) return;
    field.onUpdate!(updated);
  });
}

function addInitialValue(doc: any, path: string, origin: any) {
  let subDoc = doc;
  const chunks: string[] = lodash.split(path, '.');
  const head = lodash.head(chunks)!;
  if (chunks.length === 1) {
    subDoc[`${head}Info`] = { value: subDoc[head], updatedAt: new Date(), origin };
  } else if (Array.isArray(subDoc[head])) {
    lodash.forEach(subDoc[head], d => addInitialValue(d, lodash.join(lodash.slice(chunks, 1), '.'), origin));
  } else if (typeof subDoc[head] === 'object') {
    addInitialValue(subDoc[head], lodash.join(lodash.slice(chunks, 1), '.'), origin);
  }
}

function consolidateUpdate(
  fields: Field[],
  options: any,
  filter: any,
  update: any,
  arrayFilters?: any[]
): any[] | null {
  const updatedFields = lodash.filter(fields, field => hasQueryFieldUpdate(update, field.path));
  if (!updatedFields.length) return null;

  const $set: any = {};
  lodash.each(updatedFields, field =>
    lodash.merge($set, buildUpdate(field, options?.origin ?? (field.origin ? field.origin() : undefined)))
  );

  if (Array.isArray(update)) {
    update.push({ $set });
    return update;
  }
  const transformedUpdate = updateToPipeline(filter, update, { arrayFilters });
  transformedUpdate.push({ $set });
  return transformedUpdate;
}

function hasQueryFieldUpdate(updates: any, path: string): boolean {
  for (let update of (Array.isArray(updates) ? updates : [updates]) as any[]) {
    if (hasUpdateValue(update, path)) return true;
    if (hasUpdateValue(update.$set, path)) return true;
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
  });
  if (found) return true;

  const chunks = lodash.split(path, '.');
  for (let i = chunks.length - 1; i >= 0; --i) {
    const subpath = chunks.slice(0, i).join('.');
    if (obj[subpath] !== undefined) return true;
  }
  return false;
}

function addFieldInfoSchemaPath(schema: Schema, field: Field) {
  if (!schema.path(field.infoPath)) {
    const valueType: any = { type: field.typeOptions.type, index: true };
    if (field.typeOptions.enum) {
      valueType.enum = lodash.cloneDeep(field.typeOptions.enum);
      if (!lodash.includes(valueType.enum, null)) valueType.enum.push(null);
    }

    const schemaPath = field.path.substring(0, lodash.lastIndexOf(field.path, '.'));
    const info = schema.path(schemaPath);
    const type = {
      value: valueType,
      previousValue: valueType,
      updatedAt: { type: Date },
      previousUpdatedAt: { type: Date },
      origin: { type: SchemaTypes.Mixed },
      triggerOnUpdate: { type: Boolean },
    };
    if (info?.schema) info.schema.path(field.infoPath.substring(schemaPath.length + 1), { type });
    else schema.path(field.infoPath, { type });
  }
}

function getTrackSchemaFields(schema: Schema, parentPath?: string, arrays?: string[]): Field[] {
  const fields: Field[] = [];
  lodash.each(lodash.keys(schema.paths), key => {
    const schemaType = schema.path(key);
    const path = parentPath ? `${parentPath}.${schemaType.path}` : schemaType.path;
    switch (schemaType.instance) {
      case 'Embedded':
        if (schemaType.options?.track) fields.push(buildField(schemaType, key, path, arrays));
        else fields.push(...getTrackSchemaFields(schemaType.schema, path, arrays));
        break;
      case 'Array':
        if (schemaType.options?.track) fields.push(buildField(schemaType, key, path, arrays));
        else if (schemaType.schema) {
          fields.push(...getTrackSchemaFields(schemaType.schema, path, lodash.concat(arrays || [], [key])));
        }
        break;
      default:
        if (schemaType.options?.track) fields.push(buildField(schemaType, key, path, arrays));
    }
  });

  return fields;
}

function buildField(schemaType: SchemaType, name: string, path: string, arrays: string[] | undefined): Field {
  const field: Field = {
    path,
    name,
    typeOptions: lodash.pick(schemaType.options, 'type', 'enum'),
    infoPath: `${path}Info`,
    arrays,
    origin: schemaType.options.track.origin,
    onUpdate: schemaType.options.track.onUpdate,
  };
  return field;
}

function buildUpdate(field: Field, origin: any): UpdateQuery<any> {
  if (field.arrays?.length) return buildArrayFieldUpdate(field, origin);
  return buildFieldUpdate(field, origin);
}

function buildArrayFieldUpdate(field: Field, origin: any): any {
  const last = lodash.last(field.arrays)!;
  const arrayPath = field.path.substring(0, lodash.indexOf(field.path, last) + last.length + 1);
  const valuePath = field.path.substring(arrayPath.length + 1);
  return {
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
                    typeof field.onUpdate === 'function'
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
}

function buildFieldUpdate(field: Field, origin: any): any {
  return {
    [field.infoPath]: buildFieldProjection(field.path, field.infoPath, origin, typeof field.onUpdate === 'function'),
  };
}

function buildFieldProjection(path: string, infoPath: string, origin: any, triggerOnUpdate = false): any {
  const projection: any = {
    value: `$${path}`,
    updatedAt: `$$NOW`,
    previousValue: `$${infoPath}.value`,
    previousUpdatedAt: `$${infoPath}.updatedAt`,
    origin,
    triggerOnUpdate,
  };
  return projection;
}
