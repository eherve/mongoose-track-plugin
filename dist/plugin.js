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
    schema.pre('save', async function (next, options) {
        lodash.forEach(fields, field => addInitialValue(this, field.path, options?.origin));
        next();
    });
    schema.post('save', async function (data, next) {
        lodash.forEach(fields, field => {
            if (typeof field.onUpdate !== 'function')
                return;
            field.onUpdate([{ _id: data._id, update: lodash.get(data, field.infoPath) }]);
        });
        next();
    });
    schema.pre('insertMany', async function (next, docs, options) {
        if (!Array.isArray(docs) || docs.length === 0)
            return next();
        lodash.forEach(docs, doc => lodash.forEach(fields, field => addInitialValue(doc, field.path, options?.origin)));
        next();
    });
    schema.post('insertMany', async function (data, next) {
        lodash.forEach(fields, field => {
            if (typeof field.onUpdate !== 'function')
                return;
            field.onUpdate(lodash.map(data, r => ({ _id: r._id, update: lodash.get(r, field.infoPath) })));
        });
        next();
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
    schema.post('bulkWrite', async function (res, next) {
        if (!res.modifiedCount && !res.upsertedCount)
            return next();
        await processOnUpdateFields(fields, this);
        next();
    });
    schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace'], async function (next) {
        const queryUpdate = this.getUpdate();
        if (!queryUpdate)
            return next();
        const options = this.getOptions();
        if (options.skipTrackPlugin)
            return next();
        const update = consolidateUpdate(fields, options, this.getFilter(), this.getUpdate(), options.arrayFilters);
        if (update)
            this.setUpdate(update);
        next();
    });
    schema.post(['updateOne', 'updateMany'], async function (res, next) {
        const options = this.getOptions();
        if (options.skipTrackPlugin)
            return next();
        if (!res.modifiedCount && !res.upsertedCount)
            return next();
        await processOnUpdateFields(fields, this.model, options.session);
        next();
    });
}
async function processOnUpdateFields(fields, model, session = null) {
    const fieldsWithOnUpdate = lodash.filter(fields, field => typeof field.onUpdate === 'function');
    if (!fieldsWithOnUpdate.length)
        return;
    const filter = { $or: [] };
    const projection = {};
    const update = { $set: {} };
    lodash.each(fieldsWithOnUpdate, field => {
        if (field.arrays?.length)
            return console.warn(`onUpdate is not managed for array fields: ${field.path}`);
        filter.$or.push({ [`${field.infoPath}.triggerOnUpdate`]: true });
        update.$set[`${field.infoPath}.triggerOnUpdate`] = false;
        projection[field.path.replace('.', '_')] = {
            $cond: { if: { $eq: [`$${field.infoPath}.triggerOnUpdate`, true] }, then: `$${field.infoPath}`, else: null },
        };
    });
    const data = await model
        .find(filter, projection)
        .session(session ?? null)
        .lean();
    await model.updateMany(filter, update, { skipTrackPlugin: true }).session(session ?? null);
    lodash.forEach(fieldsWithOnUpdate, field => {
        const updated = [];
        lodash.each(data, d => {
            let update = lodash.get(d, field.path.replace('.', '_'));
            if (!update)
                return;
            if (Array.isArray(update) && update.length === 0)
                return;
            updated.push({ _id: d._id, update });
        });
        if (!updated.length)
            return;
        field.onUpdate(updated);
    });
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
function consolidateUpdate(fields, options, filter, update, arrayFilters) {
    const updatedFields = lodash.filter(fields, field => (0, update_tools_1.hasQueryFieldUpdate)(update, field.path));
    if (!updatedFields.length)
        return null;
    const $set = {};
    lodash.each(updatedFields, field => lodash.merge($set, buildUpdate(field, options?.origin ?? (field.origin ? field.origin() : undefined))));
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
        value: `$${path}`,
        updatedAt: `$$NOW`,
        previousValue: `$${infoPath}.value`,
        previousUpdatedAt: `$${infoPath}.updatedAt`,
        origin,
        triggerOnUpdate,
    };
    return projection;
}
