# mongoose-track-plugin

A Mongoose plugin to **track, historize and audit changes** on specific schema fields. It generates an `.Info` field with metadata on the latest update, and optionally stores change history either inline or in a separate collection.

---

![npm version](https://img.shields.io/npm/v/mongoose-track-plugin.svg)

![license](https://img.shields.io/npm/l/mongoose-track-plugin.svg)

---

## ✨ Features

* ✅ Track updates on selected fields (`track: true | { ... }`)
* 📎 Generates a `.Info` field per tracked field (e.g., `statusInfo`)
* 🕒 Supports field-level history:
  * In-document (e.g., `statusHistory: [[timestamp, value, origin]]`)
  * In external collections with rich metadata
* 🧠 Track update origins using:
  * A custom function per field
  * The `origin` option in `.save()` / `.updateOne()` / `.updateMany()`
* 🪝 Optional `onUpdate` hook per field

---

## 📦 Installation

```bash
npm install mongoose-track-plugin
```

---

## 🧩 Usage

### 1. Basic Setup

```ts
import mongoose from 'mongoose';
import trackPlugin from 'mongoose-track-plugin';

const schema = new mongoose.Schema({
  status: {
    type: String,
    track: true, // Enable tracking
  },
});

schema.plugin(trackPlugin);
```

After update:

```js
{
  status: 'shipped',
  statusInfo: {
    updatedAt: Date,
    value: 'shipped',
    previousValue: 'pending',
    origin: 'adminPanel'
  }
}
```

### 2. Advanced Field Tracking

```ts
const schema = new mongoose.Schema({
  status: {
    type: String,
    track: {
      origin: () => 'system-script',
      historizeField: 'statusHistory', // inline history
      onUpdate: (doc, field, info) => {
        console.log(`${field} changed`, info);
      },
    },
  },
});
```

### 3. History in External Collection

```ts
const schema = new mongoose.Schema({
  phase: {
    type: String,
    track: {
      historizeCol: 'phase_histories', // use external collection
    },
  },
});
```

Each history document will follow:

```ts
interface IHistorize<T> {
  entityId: Types.ObjectId;
  itemId?: Types.ObjectId;
  path: string;
  start: Date;
  end: Date | null;
  value?: T;
  previousValue?: T;
  nextValue?: T;
  origin?: any;
  metadata?: any;
}
```

---

## 🧠 Providing origin

You can provide an origin for the update via:

### A. Schema field config

```ts
track: {
  origin: () => 'batch-script',
}
```

### B. Per-operation metadata

```ts
model.updateOne(filter, update, { origin: 'admin@domain.com' });
document.save({ origin: 'cli' });
```

---

## 🧪 Output Types

### `.Info` Field

```ts
interface FieldUpdateInfo<T> {
  updatedAt: Date;
  value?: T;
  previousValue?: T;
  origin?: any;
}
```

### Inline History

```ts
[[timestamp, value, origin], ...]
```

### Collection History

See `IHistorize<T>` above.

---

## ✅ License

MIT

---

## 📬 Contributions

Issues and PRs welcome! Please write tests for any new logic.

---

## 🧱 Author

Made by [@eherve](https://github.com/eherve)
