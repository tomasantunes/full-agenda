const mongoose = require('mongoose');

const eventSnapshotSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    start: Date,
    end: Date,
    allDay: Boolean,
    createdAt: Date,
    updatedAt: Date
  },
  {
    _id: false
  }
);

const eventChangeSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    action: {
      type: String,
      enum: ['update', 'delete', 'restore'],
      required: true,
      index: true
    },
    before: {
      type: eventSnapshotSchema,
      required: true
    },
    after: {
      type: eventSnapshotSchema,
      default: null
    }
  },
  {
    timestamps: { createdAt: 'changedAt', updatedAt: false }
  }
);

eventChangeSchema.index({ changedAt: -1 });

module.exports = mongoose.model('EventChange', eventChangeSchema);
