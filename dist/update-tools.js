"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasQueryFieldUpdate = hasQueryFieldUpdate;
const lodash = require("lodash");
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
        if (lodash.startsWith(stripKey, path))
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
