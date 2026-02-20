const mongoose = require('mongoose');

const levelNameSchema = new mongoose.Schema(
  {
    A: { type: String, trim: true, default: 'Level A' },
    B: { type: String, trim: true, default: 'Level B' },
    C: { type: String, trim: true, default: 'Level C' }
  },
  { _id: false }
);

const levelValueSchema = new mongoose.Schema(
  {
    A: [
      {
        type: String,
        trim: true,
        minlength: 1,
        maxlength: 50
      }
    ],
    B: [
      {
        parent: {
          type: String,
          trim: true,
          required: true,
          minlength: 1,
          maxlength: 50
        },
        values: [
          {
            type: String,
            trim: true,
            minlength: 1,
            maxlength: 50
          }
        ]
      }
    ],
    C: [
      {
        parent: {
          type: String,
          trim: true,
          required: true,
          minlength: 1,
          maxlength: 50
        },
        values: [
          {
            type: String,
            trim: true,
            minlength: 1,
            maxlength: 50
          }
        ]
      }
    ]
  },
  { _id: false }
);
const academicConfigSchema = new mongoose.Schema(
  {
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: true,
      unique: true
    },
    levelNames: {
      type: levelNameSchema,
      default: () => ({})
    },
    levelValues: {
      type: levelValueSchema,
      default: () => ({
        A: [],
        B: [],
        C: []
      })
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('AcademicConfig', academicConfigSchema);

