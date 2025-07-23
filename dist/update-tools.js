"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasQueryFieldUpdate = hasQueryFieldUpdate;
exports.getAggregateTargetModel = getAggregateTargetModel;
exports.getMergePipelineStage = getMergePipelineStage;
exports.addMergeUpdateStage = addMergeUpdateStage;
exports.patchModel = patchModel;
const lodash = require("lodash");
const mongoose_1 = require("mongoose");
function hasQueryFieldUpdate(updates, path) {
    for (let update of (Array.isArray(updates) ? updates : [updates])) {
        if (hasUpdateValue(update, path))
            return true;
        if (hasUpdateValue(update.$set, path))
            return true;
        if (hasUpdateValue(update.$setOnInsert, path))
            return true;
        if (hasUpdateValue(update.$addFields, path))
            return true;
        if (hasUpdateValue(update.$inc, path))
            return true;
        if (hasUpdateValue(update.$pull, path))
            return true;
        if (hasUpdateValue(update.$push, path))
            return true;
    }
    return false;
}
function hasUpdateValue(obj, path) {
    if (!obj)
        return false;
    if (obj[path] !== undefined)
        return true;
    if (lodash.get(obj, path) !== undefined)
        return true;
    const found = lodash.find(lodash.keys(obj), key => {
        const stripKey = lodash.replace(key, /\.\$(\[[^\]]*\])?/g, '');
        if (lodash.startsWith(path, stripKey))
            return true;
        if (lodash.startsWith(stripKey, `${path}.`))
            return true;
    });
    if (found)
        return true;
    const chunks = lodash.split(path, '.');
    for (let i = chunks.length - 1; i >= 0; --i) {
        const subpath = chunks.slice(0, i).join('.');
        if (obj[subpath] !== undefined)
            return true;
    }
    return false;
}
function getAggregateTargetModel(aggregate) {
    const $merge = getMergePipelineStage(aggregate);
    if (!$merge)
        return null;
    const collectionName = typeof $merge.into === 'string' ? $merge.into : $merge.into.coll;
    const model = aggregate.model();
    const modelName = lodash.find(model.db.modelNames(), modelName => {
        return model.db.models[modelName].collection.collectionName === collectionName;
    });
    const targetModel = modelName ? model.db.models[modelName] : null;
    return targetModel;
}
function getMergePipelineStage(aggregate) {
    const pipeline = aggregate.pipeline();
    const $merge = lodash.last(pipeline).$merge;
    return $merge ?? null;
}
function addMergeUpdateStage(aggregate, $set) {
    const $merge = getMergePipelineStage(aggregate);
    if (!$merge)
        return;
    if (typeof $merge.whenMatched === 'string') {
        switch ($merge.whenMatched) {
            case 'merge':
                $merge.whenMatched = [{ $replaceRoot: { newRoot: { $mergeObjects: ['$$ROOT', '$$new'] } } }, { $set }];
                break;
            case 'replace':
                $merge.whenMatched = [{ $replaceRoot: { newRoot: '$$new' } }, { $set }];
                break;
        }
    }
    else
        $merge.whenMatched?.push({ $set });
}
function patchModelMethod(prototype, flag, wrapper) {
    if (prototype[flag])
        return;
    const original = prototype.model;
    prototype.model = function (name, schema, collection, options) {
        const model = original.call(this, name, schema, collection, options);
        if (schema)
            wrapper(schema, model);
        return model;
    };
    prototype[flag] = true;
}
function patchModel(id, wrapper) {
    patchModelMethod(mongoose_1.default, `${id}_modelPatched_mongoose`, wrapper);
    patchModelMethod(mongoose_1.default.Mongoose.prototype, `${id}_modelPatched_global`, wrapper);
    patchModelMethod(mongoose_1.default.Connection.prototype, `${id}_modelPatched_conn`, wrapper);
}
