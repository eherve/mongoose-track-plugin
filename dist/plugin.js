"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackPlugin = void 0;
const mongoose_update_to_pipeline_1 = require("@eherve/mongoose-update-to-pipeline");
const async_hooks_1 = require("async_hooks");
const lodash = require("lodash");
const mongoose_1 = require("mongoose");
const uuid_1 = require("uuid");
const update_tools_1 = require("./update-tools");
const asyncStorage = new async_hooks_1.AsyncLocalStorage();
const _model = mongoose_1.default.model;
mongoose_1.default.model = function (name, schema, collection, options) {
    const model = _model.call(this, name, schema, collection, options);
    if (schema) {
        const create = model.create;
        model.create = function (doc, options) {
            return asyncStorage.run({ model, session: options?.session, v: (0, uuid_1.v4)() }, async () => create.call(this, doc, options));
        };
        const insertMany = model.insertMany;
        model.insertMany = function (doc, options) {
            return asyncStorage.run({ model, session: options?.session, v: (0, uuid_1.v4)() }, async () => insertMany.call(this, doc, options));
        };
        const bulkWrite = model.bulkWrite;
        model.bulkWrite = function (writes, options) {
            return asyncStorage.run({ model, session: options?.session, v: (0, uuid_1.v4)() }, async () => bulkWrite.call(this, writes, options));
        };
    }
    return model;
};
const trackPlugin = function (schema, options) {
    const fields = getSchemaFields(schema, undefined, undefined, options);
    if (!fields.length)
        return;
    lodash.each(fields, field => addFieldInfoSchemaPath(schema, field));
    registerMiddleWare(schema, fields);
};
exports.trackPlugin = trackPlugin;
function registerMiddleWare(schema, fields) {
    schema.pre('save', async function (options) {
        lodash.forEach(fields, field => addInitialValue(this, field.path, asyncStorage.getStore().v, options?.origin, field.historizeField));
    });
    schema.post('save', async function () {
        const store = asyncStorage.getStore();
        if (!store)
            return;
        await processPostUpdate(fields, store.model, store.v, store.session);
    });
    schema.pre('insertMany', async function (next, docs, options) {
        if (options.skipTrackPlugin)
            return next();
        if (!Array.isArray(docs) || docs.length === 0)
            return next();
        lodash.forEach(docs, doc => lodash.forEach(fields, field => addInitialValue(doc, field.path, asyncStorage.getStore().v, options?.origin, field.historizeField)));
        return next();
    });
    schema.post('insertMany', async function () {
        const store = asyncStorage.getStore();
        if (!store)
            return;
        await processPostUpdate(fields, this, store.v, store.session);
    });
    schema.pre('bulkWrite', async function (next, operations, options) {
        if (options.skipTrackPlugin)
            return next();
        lodash.each(operations, operation => {
            let block;
            if (operation.updateOne)
                block = operation.updateOne;
            else if (operation.updateMany)
                block = operation.updateMany;
            else
                return;
            const update = consolidateUpdate(fields, asyncStorage.getStore().v, options, block.filter, block.update, block.arrayFilters);
            if (!update)
                return;
            block.update = update;
        });
        next();
    });
    schema.post('bulkWrite', async function (res) {
        if (!res.modifiedCount && !res.upsertedCount)
            return;
        await processPostUpdate(fields, this, asyncStorage.getStore().v, asyncStorage.getStore()?.session);
    });
    schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace'], async function () {
        const options = this.getOptions();
        if (options.skipTrackPlugin)
            return;
        const queryUpdate = this.getUpdate();
        if (!queryUpdate)
            return;
        this['trachPluginV'] = (0, uuid_1.v4)();
        const update = consolidateUpdate(fields, this['trachPluginV'], options, this.getFilter(), this.getUpdate(), options.arrayFilters);
        if (update)
            this.setUpdate(update);
    });
    schema.post(['updateOne', 'updateMany'], async function (res) {
        const options = this.getOptions();
        if (options.skipTrackPlugin)
            return;
        if (!res.modifiedCount && !res.upsertedCount)
            return;
        await processPostUpdate(fields, this.model, this['trachPluginV'], options.session);
    });
    schema.pre('aggregate', async function () {
        if (this.options.skipTrackPlugin)
            return;
        const targetModel = (0, update_tools_1.getAggregateTargetModel)(this);
        if (!targetModel)
            return;
        const fields = getSchemaFields(targetModel?.schema);
        if (!fields.length)
            return;
        this['trachPluginV'] = (0, uuid_1.v4)();
        (0, update_tools_1.addMergeUpdateStage)(this, buildSetUpdate(fields, this['trachPluginV'], this.options));
    });
    schema.post('aggregate', async function () {
        if (this.options?.skipTrackPlugin)
            return;
        const targetModel = (0, update_tools_1.getAggregateTargetModel)(this);
        if (!targetModel)
            return;
        const fields = getSchemaFields(targetModel?.schema);
        if (!fields.length)
            return;
        await processPostUpdate(fields, targetModel, this['trachPluginV'], this.options.session);
    });
}
async function processPostUpdate(fields, model, v, session = null) {
    const toProcessFields = lodash.filter(fields, field => typeof field.onUpdate === 'function' || !!field.historizeCol);
    if (!toProcessFields.length)
        return [];
    const data = await getOnUpdateFieldsData(toProcessFields, model, v, session);
    if (!data?.length)
        return;
    processOnUpdate(toProcessFields, data, session);
    await processHistorized(toProcessFields, model, data, session);
}
function processOnUpdate(fields, data, session) {
    lodash.forEach(fields, field => {
        if (typeof field.onUpdate !== 'function')
            return;
        const updated = [];
        lodash.each(data, d => {
            const update = lodash.get(d, field.path.replace('.', '_'));
            if (!update || (Array.isArray(update) && update.length === 0))
                return;
            updated.push({ _id: d._id, path: field.path, update });
        });
        if (!updated.length)
            return;
        if (typeof field.onUpdate === 'function')
            field.onUpdate(updated, session);
    });
}
async function processHistorized(fields, model, data, session = null) {
    const bulkInfo = [];
    for (let field of fields) {
        if (!field.historizeCol)
            continue;
        for (let d of data) {
            const update = lodash.get(d, field.path.replace('.', '_'));
            let bi = lodash.find(bulkInfo, { col: field.historizeCol });
            if (!bi)
                bulkInfo.push((bi = { col: field.historizeCol, operations: [] }));
            if (Array.isArray(update)) {
                lodash.forEach(update, u => bi.operations.push(...buildHistorizeOperation(field, d._id, u)));
            }
            else
                bi.operations.push(...buildHistorizeOperation(field, d._id, update));
        }
    }
    if (bulkInfo.length) {
        for (let i of bulkInfo) {
            await model.db.collection(i.col).bulkWrite(i.operations, { ordered: true, session: session ?? undefined });
        }
    }
}
function buildHistorizeOperation(field, entityId, update) {
    const start = update?.updatedAt ?? new Date();
    const document = { entityId: entityId, path: field.path, start, end: null };
    const filter = { entityId: entityId, path: field.path, end: null };
    if (update?.itemId !== undefined)
        document.itemId = filter.itemId = update.itemId;
    if (update?.value !== undefined)
        document.value = update.value;
    if (update?.previousValue !== undefined)
        document.previousValue = update.previousValue;
    if (update?.origin !== undefined)
        document.origin = update.origin;
    if (update?.metadata !== undefined)
        document.metadata = update.metadata;
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
async function getOnUpdateFieldsData(fieldsWithOnUpdate, model, v, session = null) {
    const filter = { $or: [] };
    const projection = {};
    lodash.each(fieldsWithOnUpdate, field => {
        filter.$or.push({ [`${field.infoPath}.v`]: v });
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
        }
        else {
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
        .lean()
        .session(session ?? null);
    return data;
}
function addInitialValue(doc, path, v, origin, historizeField) {
    let subDoc = doc;
    const chunks = lodash.split(path, '.');
    const head = lodash.head(chunks);
    if (chunks.length === 1) {
        const updatedAt = new Date();
        subDoc[`${head}Info`] = { value: subDoc[head], updatedAt, origin, v };
        if (historizeField)
            subDoc[historizeField] = [[updatedAt.valueOf(), subDoc[head], origin]];
    }
    else if (Array.isArray(subDoc[head])) {
        lodash.forEach(subDoc[head], d => addInitialValue(d, lodash.join(lodash.slice(chunks, 1), '.'), v, origin, historizeField));
    }
    else if (typeof subDoc[head] === 'object') {
        addInitialValue(subDoc[head], lodash.join(lodash.slice(chunks, 1), '.'), v, origin, historizeField);
    }
}
function buildSetUpdate(fields, v, options) {
    const $set = {};
    lodash.each(fields, field => lodash.merge($set, buildUpdate(field, v, options?.origin ?? (field.origin ? field.origin() : undefined))));
    return $set;
}
function consolidateUpdate(fields, v, options, filter, update, arrayFilters) {
    const updatedFields = lodash.filter(fields, field => (0, update_tools_1.hasQueryFieldUpdate)(update, field.path));
    if (!updatedFields.length)
        return null;
    const $set = buildSetUpdate(updatedFields, v, options);
    if (Array.isArray(update)) {
        update.push({ $set });
        return update;
    }
    const transformedUpdate = (0, mongoose_update_to_pipeline_1.updateToPipeline)(filter, update, { arrayFilters, disabledWarn: true });
    transformedUpdate.push({ $set });
    return transformedUpdate;
}
function addFieldInfoSchemaPath(schema, field) {
    const schemaPath = field.path.substring(0, lodash.lastIndexOf(field.path, '.'));
    const info = schema.path(schemaPath);
    if (!schema.path(field.infoPath)) {
        const valueType = { type: field.typeOptions.type, index: true };
        if (field.typeOptions.enum) {
            valueType.enum = lodash.cloneDeep(field.typeOptions.enum);
            if (!lodash.includes(valueType.enum, null))
                valueType.enum.push(null);
        }
        const type = {
            value: valueType,
            previousValue: valueType,
            updatedAt: { type: Date },
            origin: { type: mongoose_1.SchemaTypes.Mixed },
            v: { type: String },
        };
        if (info?.schema)
            info.schema.path(field.infoPath.substring(schemaPath.length + 1), { type });
        else
            schema.path(field.infoPath, { type });
    }
    if (field.historizeField && !schema.path(field.historizeField)) {
        const type = [mongoose_1.SchemaTypes.Mixed];
        if (info?.schema)
            info.schema.path(field.historizeField, { type });
        else
            schema.path(field.historizeField, { type });
    }
}
function getSchemaFields(schema, parentPath, arrays, options) {
    const fields = [];
    lodash.each(lodash.keys(schema.paths), key => {
        const schemaType = schema.path(key);
        const path = parentPath ? `${parentPath}.${schemaType.path}` : schemaType.path;
        switch (schemaType.instance) {
            case 'Embedded':
                if (schemaType.options?.track)
                    fields.push(buildField(schemaType, key, path, arrays, options));
                else
                    fields.push(...getSchemaFields(schemaType.schema, path, arrays, options));
                break;
            case 'Array':
                if (schemaType.options?.track)
                    fields.push(buildField(schemaType, key, path, arrays, options));
                else if (schemaType.schema) {
                    fields.push(...getSchemaFields(schemaType.schema, path, lodash.concat(arrays || [], [key]), options));
                }
                break;
            default:
                if (schemaType.options?.track)
                    fields.push(buildField(schemaType, key, path, arrays, options));
        }
    });
    return fields;
}
function buildField(schemaType, name, path, arrays, options) {
    const field = {
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
function buildUpdate(field, v, origin) {
    if (field.arrays?.length)
        return buildArrayFieldUpdate(field, origin, v);
    return buildFieldUpdate(field, origin, v);
}
function buildArrayFieldUpdate(field, origin, v) {
    const last = lodash.last(field.arrays);
    const arrayPath = field.path.substring(0, lodash.indexOf(field.path, last) + last.length + 1);
    const valuePath = field.path.substring(arrayPath.length + 1);
    const update = {
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
                                    [`${valuePath}Info`]: buildFieldProjection(`$elemt.${valuePath}`, `$elemt.${valuePath}Info`, origin, v),
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
function buildFieldUpdate(field, origin, v) {
    const update = {
        [field.infoPath]: buildFieldProjection(field.path, field.infoPath, origin, v),
    };
    if (field.historizeField) {
        update[field.historizeField] = buildFieldHistorizedProjection(`$${field.historizeField}`, field.path, field.infoPath, origin);
    }
    return update;
}
function buildFieldHistorizedProjection(value, path, infoPath, origin) {
    const data = [{ $toLong: '$$NOW' }, `$${path}`];
    if (origin)
        data.push(origin);
    return {
        $concatArrays: [value, { $cond: { if: { $ne: [`$${infoPath}.value`, `$${path}`] }, then: [data], else: [] } }],
    };
}
function buildFieldProjection(path, infoPath, origin, v) {
    return {
        $cond: {
            if: { $ne: [`$${infoPath}.value`, `$${path}`] },
            then: { value: `$${path}`, updatedAt: `$$NOW`, previousValue: `$${infoPath}.value`, origin, v },
            else: `$${infoPath}`,
        },
    };
}
