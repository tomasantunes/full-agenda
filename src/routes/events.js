const express = require('express');
const Event = require('../models/Event');

const router = express.Router();

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

    const event = await Event.findByIdAndUpdate(req.params.id, parsed.data, {
      new: true,
      runValidators: true
    });

    if (!event) {
      return res.status(404).json({ message: 'Event not found.' });
    }

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

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { start, end, allDay },
      { new: true, runValidators: true }
    );

    if (!event) {
      return res.status(404).json({ message: 'Event not found.' });
    }

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
