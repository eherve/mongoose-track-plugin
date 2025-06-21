"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackPlugin = void 0;
const mongoose_update_to_pipeline_1 = require("@eherve/mongoose-update-to-pipeline");
const lodash = require("lodash");
const mongoose_1 = require("mongoose");
const update_tools_1 = require("./update-tools");
const trackPlugin = function (schema) {
    const fields = getTrackSchemaFields(schema);
    if (!fields.length)
        return;
    lodash.each(fields, field => addFieldInfoSchemaPath(schema, field));
    registerMiddleWare(schema, fields);
};
exports.trackPlugin = trackPlugin;
function registerMiddleWare(schema, fields) {
    schema.pre('save', async function (options) {
        lodash.forEach(fields, field => addInitialValue(this, field.path, options?.origin));
    });
    schema.pre('insertMany', async function (next, docs, options) {
        if (options.skipTrackPlugin)
            return next();
        if (!Array.isArray(docs) || docs.length === 0)
            return next();
        lodash.forEach(docs, doc => lodash.forEach(fields, field => addInitialValue(doc, field.path, options?.origin)));
        return next();
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
            const update = consolidateUpdate(fields, options, block.filter, block.update, block.arrayFilters);
            if (!update)
                return;
            block.update = update;
        });
        next();
    });
    schema.post('bulkWrite', async function (res) {
        if (!res.modifiedCount && !res.upsertedCount)
            return;
        await processOnUpdateFields(fields, this);
    });
    schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace'], async function () {
        const options = this.getOptions();
        if (options.skipTrackPlugin)
            return;
        const queryUpdate = this.getUpdate();
        if (!queryUpdate)
            return;
        const update = consolidateUpdate(fields, options, this.getFilter(), this.getUpdate(), options.arrayFilters);
        if (update)
            this.setUpdate(update);
    });
    schema.post(['updateOne', 'updateMany'], async function (res) {
        const options = this.getOptions();
        if (options.skipTrackPlugin)
            return;
        if (!res.modifiedCount && !res.upsertedCount)
            return;
        await processOnUpdateFields(fields, this.model, options.session);
    });
    schema.pre('aggregate', function (next, options) {
        if (options?.skipTrackPlugin)
            return next();
        const targetModel = getAggregateTargetModel(this);
        if (!targetModel)
            return next();
        const pipeline = this.pipeline();
        const $merge = lodash.last(pipeline).$merge;
        const fields = getTrackSchemaFields(targetModel?.schema);
        if (!fields.length)
            return next();
        if (typeof $merge.whenMatched === 'string') {
            switch ($merge.whenMatched) {
                case 'merge':
                    $merge.whenMatched = [
                        { $replaceRoot: { newRoot: { $mergeObjects: ['$$ROOT', '$$new'] } } },
                        { $set: buildSetUpdate(fields, options) },
                    ];
                    break;
                case 'replace':
                    $merge.whenMatched = [{ $replaceRoot: { newRoot: '$$new' } }, { $set: buildSetUpdate(fields, options) }];
                    break;
            }
        }
        else {
            $merge.whenMatched?.push({ $set: buildSetUpdate(fields, options) });
        }
        return next();
    });
    schema.post('aggregate', async function (options) {
        if (options?.skipTrackPlugin)
            return;
        const targetModel = getAggregateTargetModel(this);
        if (!targetModel)
            return;
        const fields = getTrackSchemaFields(targetModel?.schema);
        if (!fields.length)
            return;
        await processOnUpdateFields(fields, targetModel, options?.session);
    });
}
function getAggregateTargetModel(aggregate) {
    const pipeline = aggregate.pipeline();
    const mergeStage = lodash.last(pipeline);
    if (!mergeStage?.$merge)
        return null;
    const collectionName = typeof mergeStage.$merge.into === 'string' ? mergeStage.$merge.into : mergeStage.$merge.into.coll;
    const model = aggregate.model();
    const modelName = lodash.find(model.db.modelNames(), modelName => {
        return model.db.models[modelName].collection.collectionName === collectionName;
    });
    const targetModel = modelName ? model.db.models[modelName] : null;
    return targetModel;
}
async function processOnUpdateFields(fields, model, session = null) {
    const fieldsWithOnUpdate = lodash.filter(fields, field => typeof field.onUpdate === 'function');
    if (!fieldsWithOnUpdate.length)
        return;
    const filter = { $or: [] };
    const projection = {};
    const update = { $set: {} };
    lodash.each(fieldsWithOnUpdate, field => {
        filter.$or.push({ [`${field.infoPath}.triggerOnUpdate`]: true });
        const chunks = lodash.split(field.infoPath, '.');
        const infoField = lodash.last(chunks);
        const projectionPath = chunks.length > 1 ? lodash.join(lodash.slice(chunks, 0, -1)) : '$ROOT';
        if (field.arrays?.length) {
            if (field.arrays.length > 1)
                return console.warn(`unmanaged on update trigger on  array of array (${field.path})`);
            lodash.merge(update.$set, buildOnUpdateFieldsArrayPart(field, field.path));
            projection[field.path.replace('.', '_')] = {
                $map: {
                    input: {
                        $filter: {
                            input: `$${projectionPath}`,
                            as: 'item',
                            cond: { $eq: [`$$item.${infoField}.triggerOnUpdate`, true] },
                        },
                    },
                    as: 'item',
                    in: {
                        $mergeObjects: [`$$item.${infoField}`, { itemId: '$$item._id' }, { metadata: field.onUpdateMetadata }],
                    },
                },
            };
        }
        else {
            update.$set[`${field.infoPath}.triggerOnUpdate`] = false;
            projection[field.path.replace('.', '_')] = {
                $cond: {
                    if: { $eq: [`$${field.infoPath}.triggerOnUpdate`, true] },
                    then: {
                        $mergeObjects: [
                            `$${field.infoPath}`,
                            { itemId: `$${projectionPath}._id` },
                            { metadata: field.onUpdateMetadata },
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
    await model.updateMany(filter, [update], { skipTrackPlugin: true }).session(session ?? null);
    lodash.forEach(fieldsWithOnUpdate, field => {
        const updated = [];
        lodash.each(data, d => {
            let update = lodash.get(d, field.path.replace('.', '_'));
            if (!update)
                return;
            if (Array.isArray(update) && update.length === 0)
                return;
            updated.push({ _id: d._id, path: field.path, update });
        });
        if (!updated.length)
            return;
        field.onUpdate(updated);
    });
}
function buildOnUpdateFieldsArrayPart(field, subpath, item) {
    if (!subpath.length)
        return { triggerOnUpdate: false };
    let key = '';
    const chunks = lodash.split(subpath, '.');
    for (let chunk of chunks) {
        key = key.length ? `${key}.${chunk}` : chunk;
        if (!!lodash.find(field.arrays, a => a === chunk)) {
            const subItem = item ? `${item}_${key}Elmt` : `${key}Elmt`;
            return {
                [key]: {
                    $map: {
                        input: `$${item ?? key}`,
                        as: subItem,
                        in: {
                            $mergeObjects: [
                                `$$${subItem}`,
                                buildOnUpdateFieldsArrayPart(field, subpath.slice(key.length + 1), subItem),
                            ],
                        },
                    },
                },
            };
        }
        if (item) {
            const subItem = chunks.length === 1 ? `${key}Info` : key;
            return {
                [subItem]: {
                    $mergeObjects: [
                        `$$${item}.${subItem}`,
                        buildOnUpdateFieldsArrayPart(field, subpath.slice(key.length + 1), item ? `${item}.key` : `$${key}`),
                    ],
                },
            };
        }
    }
    return { [key]: { triggerOnUpdate: false } };
}
function addInitialValue(doc, path, origin) {
    let subDoc = doc;
    const chunks = lodash.split(path, '.');
    const head = lodash.head(chunks);
    if (chunks.length === 1) {
        subDoc[`${head}Info`] = { value: subDoc[head], updatedAt: new Date(), origin };
    }
    else if (Array.isArray(subDoc[head])) {
        lodash.forEach(subDoc[head], d => addInitialValue(d, lodash.join(lodash.slice(chunks, 1), '.'), origin));
    }
    else if (typeof subDoc[head] === 'object') {
        addInitialValue(subDoc[head], lodash.join(lodash.slice(chunks, 1), '.'), origin);
    }
}
function buildSetUpdate(fields, options) {
    const $set = {};
    lodash.each(fields, field => lodash.merge($set, buildUpdate(field, options?.origin ?? (field.origin ? field.origin() : undefined))));
    return $set;
}
function consolidateUpdate(fields, options, filter, update, arrayFilters) {
    const updatedFields = lodash.filter(fields, field => (0, update_tools_1.hasQueryFieldUpdate)(update, field.path));
    if (!updatedFields.length)
        return null;
    const $set = buildSetUpdate(updatedFields, options);
    if (Array.isArray(update)) {
        update.push({ $set });
        return update;
    }
    const transformedUpdate = (0, mongoose_update_to_pipeline_1.updateToPipeline)(filter, update, { arrayFilters, disabledWarn: true });
    transformedUpdate.push({ $set });
    return transformedUpdate;
}
function addFieldInfoSchemaPath(schema, field) {
    if (!schema.path(field.infoPath)) {
        const valueType = { type: field.typeOptions.type, index: true };
        if (field.typeOptions.enum) {
            valueType.enum = lodash.cloneDeep(field.typeOptions.enum);
            if (!lodash.includes(valueType.enum, null))
                valueType.enum.push(null);
        }
        const schemaPath = field.path.substring(0, lodash.lastIndexOf(field.path, '.'));
        const info = schema.path(schemaPath);
        const type = {
            value: valueType,
            previousValue: valueType,
            updatedAt: { type: Date },
            previousUpdatedAt: { type: Date },
            origin: { type: mongoose_1.SchemaTypes.Mixed },
            triggerOnUpdate: { type: Boolean },
        };
        if (info?.schema)
            info.schema.path(field.infoPath.substring(schemaPath.length + 1), { type });
        else
            schema.path(field.infoPath, { type });
    }
}
function getTrackSchemaFields(schema, parentPath, arrays) {
    const fields = [];
    lodash.each(lodash.keys(schema.paths), key => {
        const schemaType = schema.path(key);
        const path = parentPath ? `${parentPath}.${schemaType.path}` : schemaType.path;
        switch (schemaType.instance) {
            case 'Embedded':
                if (schemaType.options?.track)
                    fields.push(buildField(schemaType, key, path, arrays));
                else
                    fields.push(...getTrackSchemaFields(schemaType.schema, path, arrays));
                break;
            case 'Array':
                if (schemaType.options?.track)
                    fields.push(buildField(schemaType, key, path, arrays));
                else if (schemaType.schema) {
                    fields.push(...getTrackSchemaFields(schemaType.schema, path, lodash.concat(arrays || [], [key])));
                }
                break;
            default:
                if (schemaType.options?.track)
                    fields.push(buildField(schemaType, key, path, arrays));
        }
    });
    return fields;
}
function buildField(schemaType, name, path, arrays) {
    const field = {
        path,
        name,
        typeOptions: lodash.pick(schemaType.options, 'type', 'enum'),
        infoPath: `${path}Info`,
        arrays,
        origin: schemaType.options.track.origin,
        onUpdate: schemaType.options.track.onUpdate,
        onUpdateMetadata: schemaType.options.track.onUpdateMetadata,
    };
    return field;
}
function buildUpdate(field, origin) {
    if (field.arrays?.length)
        return buildArrayFieldUpdate(field, origin);
    return buildFieldUpdate(field, origin);
}
function buildArrayFieldUpdate(field, origin) {
    const last = lodash.last(field.arrays);
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
                                    [`${valuePath}Info`]: buildFieldProjection(`$elemt.${valuePath}`, `$elemt.${valuePath}Info`, origin, typeof field.onUpdate === 'function'),
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
function buildFieldUpdate(field, origin) {
    return {
        [field.infoPath]: buildFieldProjection(field.path, field.infoPath, origin, typeof field.onUpdate === 'function'),
    };
}
function buildFieldProjection(path, infoPath, origin, triggerOnUpdate = false) {
    const projection = {
        $cond: {
            if: { $ne: [`$${infoPath}.value`, `$${path}`] },
            then: {
                value: `$${path}`,
                updatedAt: `$$NOW`,
                previousValue: `$${infoPath}.value`,
                previousUpdatedAt: `$${infoPath}.updatedAt`,
                origin,
                triggerOnUpdate: true,
            },
            else: `$${infoPath}`,
        },
    };
    return projection;
}
