const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();

const eventRoutes = require('./src/routes/events');
const Event = require('./src/models/Event');

const app = express();
const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fullcalendar_events';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.render('index', {
    title: 'Calendar'
  });
});

function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(value);
}

app.get('/events', async (req, res, next) => {
  try {
    const events = await Event.find({}).sort({ start: 1 });

    res.render('events', {
      title: 'Events',
      events,
      formatDateTime
    });
  } catch (error) {
    next(error);
  }
});

app.use('/api/events', eventRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

async function start() {
  try {
    await mongoose.connect(mongoUri);
    app.listen(port, () => {
      console.log(`Calendar app running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start app:', error.message);
    process.exit(1);
  }
}

start();
