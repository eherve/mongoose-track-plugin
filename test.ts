/** @format */

import { inspect } from 'util';
import lodash, { isNil } from 'lodash';

// function getFilter(filters: any[], property: string, as: string) {
//   const propertyFilter: any[] = [];
//   (filters ?? []).forEach(filter => {
//     Object.keys(filter).forEach(key => {
//       if (key === property || key.startsWith(`${property}.`)) {
//         const value = key === property ? `$$${as}` : `$$${as}.${key.slice(property.length + 1)}`;
//         const filterValue = filter[key];
//         if (typeof filterValue === 'object') {
//           propertyFilter.push(
//             ...Object.keys(filterValue).map(k =>
//               k.startsWith('$') ? { [k]: [value, filterValue[k]] } : { $eq: [value, filterValue[k]] }
//             )
//           );
//         } else propertyFilter.push({ $eq: [value, filterValue] });
//       }
//     });
//   });
//   console.log(inspect({ filters, property, as, propertyFilter }, false, null, true));
//   return propertyFilter;
// }

// function parsePropertyValue(key: string): { property: string; array: string | null; path: string } {
//   let base: string | undefined, array: string | null, path: string | undefined;
//   key.split('.').forEach(k => {
//     if (array === undefined && k.includes('$')) {
//       if (k === '$' || k === '$[]') array = null;
//       else if (k.startsWith('$[') && k.endsWith(']')) array = k.slice(2, k.length - 1);
//       else array = k.slice(1);
//     } else if (array !== undefined) path = path ? `${path}.${k}` : k;
//     else base = base ? `${base}.${k}` : k;
//   });
//   return { property: base!, array: array!, path: path! };
// }

// function mapValue(key: string, value: any, filters: any[], prefix?: string): any {
//   if (!key.includes('$')) return key;
//   const { property, array, path } = parsePropertyValue(key);
//   //   console.log({ property, array, path });
//   const as = prefix ? `${prefix}${property}Elemt` : `${property}Elemt`;
//   const input = prefix ? `$$${prefix}.${property}` : `$${property}`;
//   const mergeValue = path.includes('$') ? mapValue(path, value, filters, as) : { [path]: value };

//   const propertyFilter = getFilter(filters, array || property, as);

//   const transform = propertyFilter.length
//     ? { $cond: { if: { $and: propertyFilter }, then: { $mergeObjects: [`$$${as}`, mergeValue] }, else: `$$${as}` } }
//     : { $mergeObjects: [`$$${as}`, mergeValue] };
//   const update = { [property]: { $map: { input, as, in: transform } } };
//   return update;
// }

// const key = 'base.$.sub.$[test].key';
// const filters = [
//   { 'base.code': 'base code filter' },
//   { 'base.status': 'base status filter' },
//   { 'test.code': 'base.sub code filter' },
//   { 'test.status': { $in: ['status 1', 'status 2'] } },
// ];
// console.log(inspect({ key, filters }, false, null, true));
// console.log(inspect(mapValue(key, 'value test', filters), false, null, true));

type Field = {
  path: string;
  name: string;
  infoPath: string;
  arrays?: string[];
};

// function getQueryFieldUpdate(updates: any, path: string): any {
//   for (let update of (Array.isArray(updates) ? updates : [updates]) as any[]) {
//     if (getUpdateValue(update, path)) return true;
//     if (getUpdateValue(update.$set, path)) return true;
//     if (getUpdateValue(update.$addFields, path)) return true;
//     if (getUpdateValue(update.$inc, path)) return true;
//     if (getUpdateValue(update.$pull, path)) return true;
//     if (getUpdateValue(update.$push, path)) return true;
//   }
//   return false;
// }

// function getUpdateValue(obj: any, path: string): { key: string; value: any } | undefined {
//   if (isNil(obj)) return;
//   if (obj[path] !== undefined) return { key: path, value: obj[path] };
//   if (lodash.get(obj, path) !== undefined) return { key: path, value: lodash.get(obj, path) };

//   const found = lodash.find(lodash.keys(obj), key => {
//     const stripKey = lodash.replace(key, /\.\$(\[[^\]]*\])?/g, '');
//     if (lodash.startsWith(path, stripKey)) return true;
//   });
//   if (found) return true;

//   const chunks = lodash.split(path, '.');
//   for (let i = chunks.length - 1; i >= 0; --i) {
//     const subpath = chunks.slice(0, i).join('.');
//     if (obj[subpath] !== undefined) return true;
//   }
//   return false;
// }

function flattenKeys(obj: any): { key: string; flatKey: string }[] {
  const flatten: { key: string; flatKey: string }[] = [];
  lodash.each(lodash.keys(obj), key => {
    const value = obj[key];
      const type = Object.prototype.toString.call(value)
      const isobject = (
        type === '[object Object]' ||
        type === '[object Array]'
      )
    if (Array.isArray(obj[key])) {
    } else if (Object.prototype.toString.call(value)) {
      lodash.each(flattenKeys(obj[key]), subKey => {
        flatten.push({ key: `${key}.${subKey.key}`, flatKey: `${key}.${subKey.flatKey}` });
      });
    } else {
      flatten.push({ key, flatKey: key });
    }
  });
  return flatten;
}

function consolidateUpdate(fields: Field[], origin: any, filter: any, update: any): any {
  if (Array.isArray(update)) return update.map(u => consolidateUpdate(fields, origin, filter, u));
}

const fields: Field[] = [];
const origin: any = null;
const filter = { code: 'A004', 'array.code': 'X100' };
const update = { $set: { 'array.$.status': 'value' } };
consolidateUpdate(fields, origin, filter, update);
