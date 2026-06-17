const express = require('express');
const Event = require('../models/Event');
const EventChange = require('../models/EventChange');

const router = express.Router();

function toEventSnapshot(event) {
  return {
    title: event.title,
    description: event.description || '',
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt
  };
}

function toCalendarEvent(event) {
  return {
    id: event._id.toString(),
    title: event.title,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    extendedProps: {
      description: event.description || ''
    }
  };
}

function toEventChange(change) {
  return {
    id: change._id.toString(),
    eventId: change.eventId.toString(),
    action: change.action,
    before: change.before,
    after: change.after,
    changedAt: change.changedAt
  };
}

function formatExportDateTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'full',
    timeStyle: 'short'
  }).format(value);
}

function cleanExportText(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).replace(/\s+/g, ' ');
}

function toEventsText(events) {
  const lines = [
    'Events',
    `Generated: ${formatExportDateTime(new Date())}`,
    `Total events: ${events.length}`,
    ''
  ];

  if (!events.length) {
    lines.push('No events found.');
    return lines.join('\n');
  }

  events.forEach((event, index) => {
    lines.push(`${index + 1}. ${cleanExportText(event.title, 'Untitled event')}`);
    lines.push(`   Description: ${cleanExportText(event.description, 'No description')}`);
    lines.push(`   Start: ${formatExportDateTime(event.start)}`);
    lines.push(`   End: ${formatExportDateTime(event.end)}`);
    lines.push('');
  });

  return lines.join('\n');
}

function parseEventPayload(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const start = body.start ? new Date(body.start) : null;
  const end = body.end ? new Date(body.end) : null;
  const allDay = Boolean(body.allDay);

  if (!title) {
    return { error: 'Event title is required.' };
  }

  if (!start || Number.isNaN(start.getTime())) {
    return { error: 'A valid start date and time is required.' };
  }

  if (!end || Number.isNaN(end.getTime())) {
    return { error: 'A valid end date and time is required.' };
  }

  if (end <= start) {
    return { error: 'End date and time must be after the start.' };
  }

  return {
    data: {
      title,
      description,
      start,
      end,
      allDay
    }
  };
}

router.get('/changes', async (req, res, next) => {
  try {
    const changes = await EventChange.find({}).sort({ changedAt: -1 }).limit(100);
    res.json(changes.map(toEventChange));
  } catch (error) {
    next(error);
  }
});

router.post('/changes/:changeId/restore', async (req, res, next) => {
  try {
    const change = await EventChange.findById(req.params.changeId);

    if (!change) {
      return res.status(404).json({ message: 'Event change not found.' });
    }

    const current = await Event.findById(change.eventId);
    const restoredEvent = await Event.findByIdAndUpdate(
      change.eventId,
      { $set: change.before },
      {
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
        upsert: true
      }
    );

    await EventChange.create({
      eventId: restoredEvent._id,
      action: 'restore',
      before: current ? toEventSnapshot(current) : change.before,
      after: toEventSnapshot(restoredEvent)
    });

    res.json(toCalendarEvent(restoredEvent));
  } catch (error) {
    next(error);
  }
});

router.get('/export.txt', async (req, res, next) => {
  try {
    const events = await Event.find({}).sort({ start: 1 });
    const body = toEventsText(events);

    res.set({
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename="events.txt"'
    });
    res.send(body);
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const query = {};
    const rangeStart = req.query.start ? new Date(req.query.start) : null;
    const rangeEnd = req.query.end ? new Date(req.query.end) : null;

    if (rangeStart && rangeEnd && !Number.isNaN(rangeStart.getTime()) && !Number.isNaN(rangeEnd.getTime())) {
      query.start = { $lt: rangeEnd };
      query.end = { $gt: rangeStart };
    }

    const events = await Event.find(query).sort({ start: 1 });
    res.json(events.map(toCalendarEvent));
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = parseEventPayload(req.body);

    if (parsed.error) {
      return res.status(400).json({ message: parsed.error });
    }

    const event = await Event.create(parsed.data);
    res.status(201).json(toCalendarEvent(event));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const parsed = parseEventPayload(req.body);

    if (parsed.error) {
      return res.status(400).json({ message: parsed.error });
    }

    const previousEvent = await Event.findById(req.params.id);

    if (!previousEvent) {
      return res.status(404).json({ message: 'Event not found.' });
    }

    const event = await Event.findByIdAndUpdate(req.params.id, parsed.data, {
      new: true,
      runValidators: true
    });

    await EventChange.create({
      eventId: event._id,
      action: 'update',
      before: toEventSnapshot(previousEvent),
      after: toEventSnapshot(event)
    });

    res.json(toCalendarEvent(event));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/times', async (req, res, next) => {
  try {
    const start = req.body.start ? new Date(req.body.start) : null;
    const end = req.body.end ? new Date(req.body.end) : null;
    const allDay = Boolean(req.body.allDay);

    if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Valid start and end date-times are required.' });
    }

    if (end <= start) {
      return res.status(400).json({ message: 'End date and time must be after the start.' });
    }

    const previousEvent = await Event.findById(req.params.id);

    if (!previousEvent) {
      return res.status(404).json({ message: 'Event not found.' });
    }

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { start, end, allDay },
      { new: true, runValidators: true }
    );

    await EventChange.create({
      eventId: event._id,
      action: 'update',
      before: toEventSnapshot(previousEvent),
      after: toEventSnapshot(event)
    });

    res.json(toCalendarEvent(event));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found.' });
    }

    await EventChange.create({
      eventId: event._id,
      action: 'delete',
      before: toEventSnapshot(event),
      after: null
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.use((error, req, res, next) => {
  if (error.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid event id.' });
  }

  console.error(error);
  res.status(500).json({ message: 'Something went wrong while handling events.' });
});

module.exports = router;
