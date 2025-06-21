/** @format */

import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import mongoose from 'mongoose';
import { v4 } from 'uuid';
import { trackPlugin } from './plugin';
import { inspect } from 'util';

const mongoUrl = `mongodb://localhost:4242/test-datatable`;
mongoose.set('strictQuery', false);

const embeddedSchema = new mongoose.Schema({
  code: { type: String },
  status: {
    type: String,
    track: {
      onUpdate: data => {
        onUpdateData = data;
      },
      onUpdateMetadata: {
        code: '$code',
      },
    },
  },
  stage: {
    type: String,
    track: true,
  },
});

let onUpdateData: any;
const schema = new mongoose.Schema({
  code: { type: String },
  status: {
    type: String,
    track: {
      onUpdate: data => {
        onUpdateData = data;
      },
      onUpdateMetadata: {
        code: '$code',
      },
    },
    enum: ['disponible', 'indisponible', 'précommande', 'erreur'],
  },
  stage: {
    type: String,
    track: {
      origin: () => `schema-origin`,
      onUpdate: data => {
        onUpdateData = data;
      },
    },
  },
  description: String,
  array: {
    type: [
      {
        code: { type: String },
        status: {
          type: String,
          // track: true,
          track: {
            onUpdate: data => {
              onUpdateData = data;
            },
            onUpdateMetadata: {
              code: '$code',
              arrayCodes: '$array.code',
              arrayCode: '$$item.code',
            },
          },
        },
        stage: {
          type: String,
          track: true,
        },
      },
    ],
  },

  embeddedSchema: { type: embeddedSchema },
  embeddedSchemaArray: { type: [embeddedSchema] },
});

schema.plugin(trackPlugin);

const model: mongoose.Model<any> = mongoose.model('Test', schema) as any;
const otherModel: mongoose.Model<any> = mongoose.model('Embedded', embeddedSchema) as any;

chai.use(chaiAsPromised);
const expect = chai.expect;

describe('Track Lib', () => {
  before(done => {
    mongoose.connect(mongoUrl);
    mongoose.connection.on('error', done);
    mongoose.connection.on('open', done);
  });

  beforeEach(reset);

  describe('Initial value', () => {
    it('insert many on property', async () => {
      await model.find().then(data => {
        data.forEach(d => {
          // console.log(d)
          expect(d).to.not.be.null;
          expect(d).to.have.property('status');
          expect(d.statusInfo).to.not.be.null;
          expect(d.statusInfo).to.have.property('value', d.status);
        });
      });
    });

    it('insert many on embeded schema property', async () => {
      await model.findOne({ code: 'A001' }).then(data => {
        expect(data).to.not.be.null;
        expect(data.embeddedSchema).to.not.be.null;
        expect(data.embeddedSchema).to.have.property('status', 'actif');
        expect(data.embeddedSchema.statusInfo).to.not.be.null;
        expect(data.embeddedSchema.statusInfo).to.have.property('value', 'actif');
      });
    });

    it('insert many on embeded schema array property', async () => {
      await model.findOne({ code: 'A002' }).then(data => {
        expect(data).to.not.be.null;
        expect(data.embeddedSchemaArray).to.not.be.null;
        expect(data.embeddedSchemaArray[0]).to.not.be.null;
        expect(data.embeddedSchemaArray[0]).to.have.property('status', 'en attente');
        expect(data.embeddedSchemaArray[0].statusInfo).to.not.be.null;
        expect(data.embeddedSchemaArray[0].statusInfo).to.have.property('value', 'en attente');
      });
    });

    it('insert many on array property', async () => {
      await model.findOne({ code: 'A004' }).then(data => {
        expect(data).to.not.be.null;
        expect(data.array).to.not.be.null;
        expect(data.array[0]).to.not.be.null;
        expect(data.array[0]).to.have.property('status', 'en attente');
        expect(data.array[0].statusInfo).to.not.be.null;
        expect(data.array[0].statusInfo).to.have.property('value', 'en attente');
      });
    });

    it('insert one on property', async () => {
      await model.findOne({ code: 'A003' }).then(data => {
        expect(data).to.not.be.null;
        expect(data).to.have.property('status', 'précommande');
        expect(data.statusInfo).to.not.be.null;
        expect(data.statusInfo).to.have.property('value', 'précommande');
      });
    });

    it('insert one on embeded schema property', async () => {
      await model.findOne({ code: 'A003' }).then(data => {
        expect(data).to.not.be.null;
        expect(data.embeddedSchema).to.not.be.null;
        expect(data.embeddedSchema).to.have.property('status', 'actif');
        expect(data.embeddedSchema.statusInfo).to.not.be.null;
        expect(data.embeddedSchema.statusInfo).to.have.property('value', 'actif');
      });
    });

    it('insert one on embeded schema array property', async () => {
      await model.findOne({ code: 'A003' }).then(data => {
        expect(data).to.not.be.null;
        expect(data.embeddedSchemaArray).to.not.be.null;
        expect(data.embeddedSchemaArray[0]).to.not.be.null;
        expect(data.embeddedSchemaArray[0]).to.have.property('status', 'en attente');
        expect(data.embeddedSchemaArray[0].statusInfo).to.not.be.null;
        expect(data.embeddedSchemaArray[0].statusInfo).to.have.property('value', 'en attente');
      });
    });

    it('insert one on array property', async () => {
      await model.findOne({ code: 'A003' }).then(data => {
        expect(data).to.not.be.null;
        expect(data.array).to.not.be.null;
        expect(data.array[0]).to.not.be.null;
        expect(data.array[0]).to.have.property('status', 'en attente');
        expect(data.array[0].statusInfo).to.not.be.null;
        expect(data.array[0].statusInfo).to.have.property('value', 'en attente');
      });
    });
  });

  describe('Update', () => {
    it('update one on property', async () => {
      const match = { code: 'A001' };
      const previousValue = (await model.findOne(match)).status;
      const value = v4();
      await model.updateOne(match, { $set: { status: value } });
      const data = await model.findOne(match);
      expect(data).to.not.be.null;
      expect(data).to.have.property('status', value);
      expect(data.statusInfo).to.not.be.null;
      expect(data.statusInfo).to.have.property('value', value);
      expect(data.statusInfo).to.have.property('previousValue', previousValue);
      expect(onUpdateData).to.not.be.null;
      expect(onUpdateData[0]).to.not.be.null;
      expect(onUpdateData[0]._id.toHexString()).to.be.equal(data._id.toHexString());
      expect(onUpdateData[0].update).to.not.be.null;
      expect(onUpdateData[0].update).to.have.property('value', value);
      expect(onUpdateData[0].update).to.have.property('previousValue', previousValue);
    });

    it('update one on embeded schema property', async () => {
      const match = { code: 'A001' };
      const previousValue = (await model.findOne(match)).embeddedSchema.status;
      const value = v4();
      await model.updateOne(match, [{ $set: { 'embeddedSchema.status': value } }]);
      const data = await model.findOne(match);
      expect(data).to.not.be.null;
      expect(data.embeddedSchema).to.not.be.null;
      expect(data.embeddedSchema).to.have.property('status', value);
      expect(data.embeddedSchema.statusInfo).to.not.be.null;
      expect(data.embeddedSchema.statusInfo).to.have.property('value', value);
      expect(data.embeddedSchema.statusInfo).to.have.property('previousValue', previousValue);
      expect(onUpdateData).to.not.be.null;
      expect(onUpdateData[0]).to.not.be.null;
      expect(onUpdateData[0]._id.toHexString()).to.be.equal(data._id.toHexString());
      expect(onUpdateData[0].update).to.not.be.null;
      expect(onUpdateData[0].update).to.have.property('value', value);
      expect(onUpdateData[0].update).to.have.property('previousValue', previousValue);
    });

    it('update one on embeded schema array property', async () => {
      const match = { code: 'A002' };
      const previousValue = (await model.findOne(match)).embeddedSchemaArray.find(e => e.code === 'X100').status;
      const value = v4();
      await model.updateOne(
        match,
        { $set: { 'embeddedSchemaArray.$[elmt].status': value } },
        { arrayFilters: [{ 'elmt.code': { $in: ['X100'] } }] }
      );
      const data = await model.findOne(match);
      expect(data).to.not.be.null;
      expect(data.embeddedSchemaArray).to.not.be.null;
      expect(data.embeddedSchemaArray[0]).to.not.be.null;
      expect(data.embeddedSchemaArray[0]).to.have.property('status', value);
      expect(data.embeddedSchemaArray[0].statusInfo).to.not.be.null;
      expect(data.embeddedSchemaArray[0].statusInfo).to.have.property('value', value);
      expect(data.embeddedSchemaArray[0].statusInfo).to.have.property('previousValue', previousValue);
      expect(onUpdateData).to.not.be.null;
      expect(onUpdateData[0]).to.not.be.null;
      expect(onUpdateData[0]._id.toHexString()).to.be.equal(data._id.toHexString());
      expect(onUpdateData[0].update).to.not.be.null;
      expect(onUpdateData[0].update).to.have.length(1);
      expect(onUpdateData[0].update[0]).to.have.property('value', value);
      expect(onUpdateData[0].update[0]).to.have.property('previousValue', previousValue);
    });

    it('update one on array property', async () => {
      const match = { code: 'A004', 'array.code': 'X100' };
      const previousValue = (await model.findOne(match)).array.find(e => e.code === 'X100').status;
      const value = v4();
      await model.updateOne(match, { $set: { 'array.$.status': value } });
      const data = await model.findOne(match);
      expect(data).to.not.be.null;
      expect(data.array).to.not.be.null;
      expect(data.array[0]).to.not.be.null;
      expect(data.array[0]).to.have.property('status', value);
      expect(data.array[0].statusInfo).to.not.be.null;
      expect(data.array[0].statusInfo).to.have.property('value', value);
      expect(data.array[0].statusInfo).to.have.property('previousValue', previousValue);
      expect(onUpdateData).to.not.be.null;
      expect(onUpdateData[0]).to.not.be.null;
      expect(onUpdateData[0]._id.toHexString()).to.be.equal(data._id.toHexString());
      expect(onUpdateData[0].update).to.not.be.null;
      expect(onUpdateData[0].update).to.have.length(1);
      expect(onUpdateData[0].update[0]).to.have.property('value', value);
      expect(onUpdateData[0].update[0]).to.have.property('previousValue', previousValue);
    });

    it('update many on property', async () => {
      await model.find({}).then(async previous => {
        const value = v4();
        await model.updateMany({}, { $set: { status: value } });
        const data = await model.find({});
        expect(data).to.not.be.null;
        expect(data).to.have.property('length').greaterThan(0);
        expect(onUpdateData).to.not.be.null;
        data.forEach((d, i) => {
          expect(d).to.not.be.null;
          expect(d).to.have.property('status', value);
          expect(d.statusInfo).to.not.be.null;
          expect(d.statusInfo).to.have.property('value', value);
          expect(d.statusInfo).to.have.property('previousValue', previous[i].status);
          expect(onUpdateData[i]).to.not.be.null;
          expect(onUpdateData[i]._id.toHexString()).to.be.equal(d._id.toHexString());
          expect(onUpdateData[i].update).to.not.be.null;
        });
      });
    });

    it('update many on embeded schema property', async () => {
      await model.find({}).then(async previous => {
        await model.updateMany({}, { $set: { 'embeddedSchema.status': 'inactif' } });
        const data = await model.find({});
        expect(data).to.not.be.null;
        expect(data).to.have.property('length').greaterThan(0);
        data.forEach((d, i) => {
          expect(d).to.not.be.null;
          expect(d.embeddedSchema).to.not.be.null;
          expect(d.embeddedSchema).to.have.property('status', 'inactif');
          expect(d.embeddedSchema.statusInfo).to.not.be.null;
          expect(d.embeddedSchema.statusInfo).to.have.property('value', 'inactif');
          const prev = previous.find(p => p._id.equals(d._id));
          if (prev?.embeddedSchema?.status) {
            expect(d.embeddedSchema.statusInfo).to.have.property('previousValue', prev.embeddedSchema.status);
          }
        });
      });
    });

    it('update many on embeded schema array property', async () => {
      await model.find({}).then(async previous => {
        await model.updateMany({}, { $set: { 'embeddedSchemaArray.$[].status': 'erreur' } });
        const data = await model.find({});
        expect(data).to.not.be.null;
        expect(data).to.have.property('length').greaterThan(0);
        data.forEach((d, di) => {
          expect(d).to.not.be.null;
          if (!d.embeddedSchemaArray?.length) return;
          d.embeddedSchemaArray.forEach((e, ei) => {
            expect(e).to.have.property('status', 'erreur');
            expect(e.statusInfo).to.not.be.null;
            expect(e.statusInfo).to.have.property('value', 'erreur');
            expect(e.statusInfo).to.have.property('previousValue', previous[di].embeddedSchemaArray[ei].status);
          });
        });
      });
    });

    it('update many on array property', async () => {
      await model.find({}).then(async previous => {
        await model.updateMany({}, { $set: { 'array.$[].status': 'erreur' } });
        const data = await model.find({});
        expect(data).to.not.be.null;
        expect(data).to.have.property('length').greaterThan(0);
        data.forEach((d, di) => {
          expect(d).to.not.be.null;
          if (!d.array?.length) return;
          d.array.forEach((e, ei) => {
            expect(e).to.have.property('status', 'erreur');
            expect(e.statusInfo).to.not.be.null;
            expect(e.statusInfo).to.have.property('value', 'erreur');
            expect(e.statusInfo).to.have.property('previousValue', previous[di].array[ei].status);
          });
        });
      });
    });

    it('bulk update one on property', async () => {
      await model.findOne({ code: 'A001' }).then(async previous => {
        await model.bulkWrite([
          {
            updateOne: {
              filter: { _id: previous._id },
              update: { $set: { status: 'test_bulk_one' } },
            },
          },
        ]);
        const data = await model.findOne({ code: 'A001' });
        expect(data).to.not.be.null;
        expect(data).to.have.property('status', 'test_bulk_one');
        expect(data.statusInfo).to.not.be.null;
        expect(data.statusInfo).to.have.property('value', 'test_bulk_one');
        expect(data.statusInfo).to.have.property('previousValue', previous.status);
      });
    });

    it('bulk update many on property', async () => {
      await model.find({}).then(async previous => {
        await model.bulkWrite([
          {
            updateMany: {
              filter: {},
              update: { $set: { status: 'test_bulk_many' } },
            },
          },
        ]);
        const data = await model.find({});
        expect(data).to.not.be.null;
        expect(data).to.have.property('length').greaterThan(0);
        data.forEach((d, i) => {
          expect(d).to.not.be.null;
          expect(d).to.have.property('status', 'test_bulk_many');
          expect(d.statusInfo).to.not.be.null;
          expect(d.statusInfo).to.have.property('value', 'test_bulk_many');
          expect(d.statusInfo).to.have.property('previousValue', previous[i].status);
        });
      });
    });

    it('aggregation merge with whenMatched pipeline on property', async () => {
      const match = { code: 'A001' };
      const previousValue = (await model.findOne(match)).status;
      const value = v4();
      await model.aggregate([
        { $match: match },
        {
          $merge: {
            into: model.collection.collectionName,
            whenNotMatched: 'discard',
            whenMatched: [{ $set: { status: value } }],
          },
        },
      ]);
      const data = await model.findOne(match);
      expect(data).to.not.be.null;
      expect(data).to.have.property('status', value);
      expect(data.statusInfo).to.not.be.null;
      expect(data.statusInfo).to.have.property('value', value);
      expect(data.statusInfo).to.have.property('previousValue', previousValue);
      expect(onUpdateData).to.not.be.null;
      expect(onUpdateData[0]).to.not.be.null;
      expect(onUpdateData[0]._id.toHexString()).to.be.equal(data._id.toHexString());
      expect(onUpdateData[0].update).to.not.be.null;
      expect(onUpdateData[0].update).to.have.property('value', value);
      expect(onUpdateData[0].update).to.have.property('previousValue', previousValue);
    });

    it('aggregation merge with whenMatched as merge on property', async () => {
      const match = { code: 'A001' };
      const previousValue = (await model.findOne(match)).status;
      const value = v4();
      await model.aggregate([
        { $match: match },
        { $project: { status: value } },
        {
          $merge: {
            into: model.collection.collectionName,
            whenNotMatched: 'discard',
            whenMatched: 'merge',
          },
        },
      ]);
      const data = await model.findOne(match);
      expect(data).to.not.be.null;
      expect(data).to.have.property('status', value);
      expect(data.statusInfo).to.not.be.null;
      expect(data.statusInfo).to.have.property('value', value);
      expect(data.statusInfo).to.have.property('previousValue', previousValue);
      expect(onUpdateData).to.not.be.null;
      expect(onUpdateData[0]).to.not.be.null;
      expect(onUpdateData[0]._id.toHexString()).to.be.equal(data._id.toHexString());
      expect(onUpdateData[0].update).to.not.be.null;
      expect(onUpdateData[0].update).to.have.property('value', value);
      expect(onUpdateData[0].update).to.have.property('previousValue', previousValue);
    });

    it('aggregation merge with whenMatched as replace on property', async () => {
      const match = { code: 'A001' };
      const previousValue = (await model.findOne(match)).status;
      const value = v4();
      await model.aggregate([
        { $match: match },
        { $addFields: { status: value } },
        {
          $merge: {
            into: model.collection.collectionName,
            whenNotMatched: 'discard',
            whenMatched: 'replace',
          },
        },
      ]);
      const data = await model.findOne(match);
      expect(data).to.not.be.null;
      expect(data).to.have.property('status', value);
      expect(data.statusInfo).to.not.be.null;
      expect(data.statusInfo).to.have.property('value', value);
      expect(data.statusInfo).to.have.property('previousValue', previousValue);
      expect(onUpdateData).to.not.be.null;
      expect(onUpdateData[0]).to.not.be.null;
      expect(onUpdateData[0]._id.toHexString()).to.be.equal(data._id.toHexString());
      expect(onUpdateData[0].update).to.not.be.null;
      expect(onUpdateData[0].update).to.have.property('value', value);
      expect(onUpdateData[0].update).to.have.property('previousValue', previousValue);
    });
  });

  describe('Update with origin', () => {
    it('update one on property with schema origin', async () => {
      const match = { code: 'A001' };
      const previousValue = (await model.findOne(match)).stage;
      await model.updateOne(match, { $set: { stage: 'schema-origin' } }).then(async () => {
        const data = await model.findOne(match);
        expect(data).to.not.be.null;
        expect(data).to.have.property('stage', 'schema-origin');
        expect(data.stageInfo).to.not.be.null;
        expect(data.stageInfo).to.have.property('value', 'schema-origin');
        expect(data.stageInfo).to.have.property('previousValue', previousValue);
        expect(data.stageInfo).to.have.property('origin', 'schema-origin');
      });
    });

    it('update one on property', async () => {
      const match = { code: 'A001' };
      const previousValue = (await model.findOne(match)).stage;
      await model.updateOne(match, { $set: { stage: 'update-one' } }, { origin: 'update-one' }).then(async () => {
        const data = await model.findOne(match);
        expect(data).to.not.be.null;
        expect(data).to.have.property('stage', 'update-one');
        expect(data.stageInfo).to.not.be.null;
        expect(data.stageInfo).to.have.property('value', 'update-one');
        expect(data.stageInfo).to.have.property('previousValue', previousValue);
        expect(data.stageInfo).to.have.property('origin', 'update-one');
      });
    });

    it('update one on embeded schema property', async () => {
      await model
        .updateOne({ code: 'A001' }, { $set: { 'embeddedSchema.stage': 'update-one' } }, { origin: 'update-one' })
        .then(async () => {
          const data = await model.findOne({ code: 'A001' });
          expect(data).to.not.be.null;
          expect(data.embeddedSchema).to.not.be.null;
          expect(data.embeddedSchema).to.have.property('stage', 'update-one');
          expect(data.embeddedSchema.stageInfo).to.not.be.null;
          expect(data.embeddedSchema.stageInfo).to.have.property('value', 'update-one');
          expect(data.embeddedSchema.stageInfo).to.have.property('previousValue', 'init');
          expect(data.embeddedSchema.stageInfo).to.have.property('origin', 'update-one');
        });
    });

    it('update one on embeded schema array property', async () => {
      await model
        .updateOne(
          { code: 'A002' },
          { $set: { 'embeddedSchemaArray.$[elmt].stage': 'update-one' } },
          { arrayFilters: [{ 'elmt.code': 'X100' }], origin: 'update-one' }
        )
        .then(async () => {
          const data = await model.findOne({ code: 'A002' });
          expect(data).to.not.be.null;
          expect(data.embeddedSchemaArray).to.not.be.null;
          expect(data.embeddedSchemaArray[0]).to.not.be.null;
          expect(data.embeddedSchemaArray[0]).to.have.property('stage', 'update-one');
          expect(data.embeddedSchemaArray[0].stageInfo).to.not.be.null;
          expect(data.embeddedSchemaArray[0].stageInfo).to.have.property('value', 'update-one');
          expect(data.embeddedSchemaArray[0].stageInfo).to.have.property('previousValue', 'init');
          expect(data.embeddedSchemaArray[0].stageInfo).to.have.property('origin', 'update-one');
        });
    });

    it('update one on array property', async () => {
      await model
        .updateOne(
          { code: 'A004' },
          { $set: { 'array.$[elmt].stage': 'update-one' } },
          { arrayFilters: [{ 'elmt.code': 'X100' }], origin: 'update-one' }
        )
        .then(async () => {
          const data = await model.findOne({ code: 'A004' });
          expect(data).to.not.be.null;
          expect(data.array).to.not.be.null;
          expect(data.array[0]).to.not.be.null;
          expect(data.array[0]).to.have.property('stage', 'update-one');
          expect(data.array[0].stageInfo).to.not.be.null;
          expect(data.array[0].stageInfo).to.have.property('value', 'update-one');
          expect(data.array[0].stageInfo).to.have.property('previousValue', 'init');
          expect(data.array[0].stageInfo).to.have.property('origin', 'update-one');
        });
    });

    it('update many on property', async () => {
      await model.find({}).then(async previous => {
        await model.updateMany({}, { $set: { stage: 'update-many' } }, { origin: 'update-one' });
        const data = await model.find({});
        expect(data).to.not.be.null;
        expect(data).to.have.property('length').greaterThan(0);
        data.forEach((d, i) => {
          expect(d).to.not.be.null;
          expect(d).to.have.property('stage', 'update-many');
          expect(d.stageInfo).to.not.be.null;
          expect(d.stageInfo).to.have.property('value', 'update-many');
          expect(d.stageInfo).to.have.property('previousValue', previous[i].stage);
          expect(d.stageInfo).to.have.property('origin', 'update-one');
        });
      });
    });

    it('update many on embeded schema property', async () => {
      await model.find({}).then(async previous => {
        await model.updateMany({}, { $set: { 'embeddedSchema.stage': 'update-many' } }, { origin: 'update-one' });
        const data = await model.find({});
        expect(data).to.not.be.null;
        expect(data).to.have.property('length').greaterThan(0);
        data.forEach((d, i) => {
          expect(d).to.not.be.null;
          expect(d.embeddedSchema).to.not.be.null;
          expect(d.embeddedSchema).to.have.property('stage', 'update-many');
          expect(d.embeddedSchema.stageInfo).to.not.be.null;
          expect(d.embeddedSchema.stageInfo).to.have.property('value', 'update-many');
          if (previous[i].embeddedSchema?.stage) {
            expect(d.embeddedSchema.stageInfo).to.have.property('previousValue', previous[i].embeddedSchema?.stage);
          }
          expect(d.embeddedSchema.stageInfo).to.have.property('origin', 'update-one');
        });
      });
    });

    it('update many on embeded schema array property', async () => {
      await model.find({}).then(async previous => {
        await model.updateMany(
          {},
          { $set: { 'embeddedSchemaArray.$[].stage': 'update-many' } },
          { origin: 'update-one' }
        );
        const data = await model.find({});
        expect(data).to.not.be.null;
        expect(data).to.have.property('length').greaterThan(0);
        data.forEach((d, di) => {
          expect(d).to.not.be.null;
          if (!d.embeddedSchemaArray?.length) return;
          d.embeddedSchemaArray.forEach((e, ei) => {
            expect(e).to.have.property('stage', 'update-many');
            expect(e.stageInfo).to.not.be.null;
            expect(e.stageInfo).to.have.property('value', 'update-many');
            expect(e.stageInfo).to.have.property('previousValue', previous[di].embeddedSchemaArray[ei].stage);
            expect(e.stageInfo).to.have.property('origin', 'update-one');
          });
        });
      });
    });

    it('update many on array property', async () => {
      await model.find({}).then(async previous => {
        await model.updateMany({}, { $set: { 'array.$[].stage': 'update-many' } }, { origin: 'update-one' });
        const data = await model.find({});
        expect(data).to.not.be.null;
        expect(data).to.have.property('length').greaterThan(0);
        data.forEach((d, di) => {
          expect(d).to.not.be.null;
          if (!d.array?.length) return;
          d.array.forEach((e, ei) => {
            expect(e).to.have.property('stage', 'update-many');
            expect(e.stageInfo).to.not.be.null;
            expect(e.stageInfo).to.have.property('value', 'update-many');
            expect(e.stageInfo).to.have.property('previousValue', previous[di].array[ei].stage);
            expect(e.stageInfo).to.have.property('origin', 'update-one');
          });
        });
      });
    });
  });

  after(() => {
    mongoose.connection.close();
  });
});

async function reset(): Promise<void> {
  await model.deleteMany();
  await seed();
}

async function seed(): Promise<void> {
  await model.insertMany(
    [
      {
        code: 'A001',
        description: 'Produit en stock',
        status: 'disponible',
        stage: 'init',
        embeddedSchema: {
          code: 'P001',
          status: 'actif',
          stage: 'init',
        },
      },
      {
        code: 'A002',
        description: 'Produit en rupture de stock',
        status: 'indisponible',
        stage: 'init',
        embeddedSchemaArray: [
          {
            code: 'X100',
            status: 'en attente',
            stage: 'init',
          },
          {
            code: 'X101',
            status: 'validé',
            stage: 'init',
          },
          {
            code: 'X102',
            status: 'rejeté',
            stage: 'init',
          },
          {
            code: 'X103',
            status: 'en cours',
            stage: 'init',
          },
          {
            code: 'X104',
            status: 'terminé',
            stage: 'init',
          },
          {
            code: 'X105',
            status: 'annulé',
            stage: 'init',
          },
        ],
      },
      {
        code: 'A004',
        description: 'Produit en précommande',
        status: 'précommande',
        stage: 'init',
        array: [
          {
            code: 'X100',
            status: 'en attente',
            stage: 'init',
          },
          {
            code: 'X101',
            status: 'validé',
            stage: 'init',
          },
        ],
      },
      {
        code: 'B001',
        description: 'Produit avec défaut mineur',
        status: 'disponible',
        stage: 'init',
      },
      {
        code: 'B002',
        description: 'Produit retiré de la vente',
        status: 'indisponible',
        stage: 'init',
      },
      {
        code: 'C001',
        description: 'Produit en promotion',
        status: 'disponible',
        stage: 'init',
      },
    ],
    { origin: 'seeder' } as any
  );

  await model.create(
    [
      {
        code: 'A003',
        description: 'Produit en précommande',
        status: 'précommande',
        stage: 'init',
        embeddedSchema: {
          code: 'P001',
          status: 'actif',
          stage: 'init',
        },
        embeddedSchemaArray: [
          {
            code: 'X100',
            status: 'en attente',
            stage: 'init',
          },
          {
            code: 'X101',
            status: 'validé',
            stage: 'init',
          },
          {
            code: 'X102',
            status: 'rejeté',
            stage: 'init',
          },
          {
            code: 'X103',
            status: 'en cours',
            stage: 'init',
          },
          {
            code: 'X104',
            status: 'terminé',
            stage: 'init',
          },
          {
            code: 'X105',
            status: 'annulé',
            stage: 'init',
          },
        ],
        array: [
          {
            code: 'X100',
            status: 'en attente',
            stage: 'init',
          },
          {
            code: 'X101',
            status: 'validé',
            stage: 'init',
          },
        ],
      },
    ],
    { origin: 'seeder' }
  );
  await model.updateOne(
    { code: 'A0084', description: 'Produit en précommande' },
    {
      $setOnInsert: {
        description: 'Produit en précommande',
        code: 'A0084',
        status: 'précommande',
      },
      $set: {
        stage: 'init',
        // array: [
        //   {
        //     code: 'X100',
        //     status: 'en attente',
        //     stage: 'init',
        //   },
        //   {
        //     code: 'X101',
        //     status: 'validé',
        //     stage: 'init',
        //   },
        // ],
      },
    },
    { upsert: true }
  );
  // console.log(await model.findOne({code: 'A0084'}));
  // throw new Error()
  // TODO bulkwrite insert
}
