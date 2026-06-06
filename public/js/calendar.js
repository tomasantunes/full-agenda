(function () {
  const modal = $('#event-modal');
  const form = $('#event-form');
  const formError = $('#form-error');
  const deleteButton = $('#delete-event-button');
  let calendar;

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function toInputDateTime(date) {
    const value = date instanceof Date ? date : new Date(date);

    return [
      value.getFullYear(),
      pad(value.getMonth() + 1),
      pad(value.getDate())
    ].join('-') + 'T' + [pad(value.getHours()), pad(value.getMinutes())].join(':');
  }

  function addDefaultEnd(start) {
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    return end;
  }

  function showError(message) {
    formError.text(message || '');
  }

  function openModal(event) {
    showError('');
    form[0].reset();

    if (event) {
      $('#modal-title').text('Edit event');
      $('#event-id').val(event.id);
      $('#event-title').val(event.title);
      $('#event-description').val(event.extendedProps.description || '');
      $('#event-start').val(toInputDateTime(event.start));
      $('#event-end').val(toInputDateTime(event.end || addDefaultEnd(event.start)));
      deleteButton.show();
    } else {
      $('#modal-title').text('New event');
      $('#event-id').val('');
      const now = new Date();
      now.setMinutes(0, 0, 0);
      $('#event-start').val(toInputDateTime(now));
      $('#event-end').val(toInputDateTime(addDefaultEnd(now)));
      deleteButton.hide();
    }

    modal.addClass('is-open').attr('aria-hidden', 'false');
    $('#event-title').trigger('focus');
  }

  function closeModal() {
    modal.removeClass('is-open').attr('aria-hidden', 'true');
  }

  function payloadFromForm() {
    return {
      title: $('#event-title').val(),
      description: $('#event-description').val(),
      start: new Date($('#event-start').val()).toISOString(),
      end: new Date($('#event-end').val()).toISOString(),
      allDay: false
    };
  }

  function ajaxJson(options) {
    return $.ajax(Object.assign({
      contentType: 'application/json',
      dataType: 'json'
    }, options));
  }

  function updateEventTimes(info) {
    const fallbackEnd = addDefaultEnd(info.event.start);

    return ajaxJson({
      url: '/api/events/' + info.event.id + '/times',
      method: 'PATCH',
      data: JSON.stringify({
        start: info.event.start.toISOString(),
        end: (info.event.end || fallbackEnd).toISOString(),
        allDay: info.event.allDay
      })
    }).fail(function (xhr) {
      info.revert();
      alert(xhr.responseJSON?.message || 'Could not update the event time.');
    });
  }

  $(function () {
    calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
      initialView: 'dayGridMonth',
      height: '100%',
      nowIndicator: true,
      selectable: true,
      editable: true,
      eventResizableFromStart: true,
      slotMinTime: '06:00:00',
      slotMaxTime: '22:00:00',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay'
      },
      buttonText: {
        today: 'Today',
        month: 'Month',
        week: 'Week',
        day: 'Day'
      },
      events: '/api/events',
      select: function (info) {
        showError('');
        form[0].reset();
        $('#modal-title').text('New event');
        $('#event-id').val('');
        $('#event-title').val('');
        $('#event-description').val('');
        $('#event-start').val(toInputDateTime(info.start));
        $('#event-end').val(toInputDateTime(info.end || addDefaultEnd(info.start)));
        deleteButton.hide();
        modal.addClass('is-open').attr('aria-hidden', 'false');
        $('#event-title').trigger('focus');
      },
      eventClick: function (info) {
        openModal(info.event);
      },
      eventDrop: updateEventTimes,
      eventResize: updateEventTimes
    });

    calendar.render();

    $('#new-event-button').on('click', function () {
      openModal();
    });

    $('#close-modal-button, #cancel-button').on('click', closeModal);

    modal.on('click', function (event) {
      if (event.target === modal[0]) {
        closeModal();
      }
    });

    form.on('submit', function (event) {
      event.preventDefault();
      showError('');

      const id = $('#event-id').val();
      const payload = payloadFromForm();
      const start = new Date(payload.start);
      const end = new Date(payload.end);

      if (end <= start) {
        showError('End date and time must be after the start.');
        return;
      }

      ajaxJson({
        url: id ? '/api/events/' + id : '/api/events',
        method: id ? 'PUT' : 'POST',
        data: JSON.stringify(payload)
      }).done(function () {
        closeModal();
        calendar.refetchEvents();
      }).fail(function (xhr) {
        showError(xhr.responseJSON?.message || 'Could not save the event.');
      });
    });

    deleteButton.on('click', function () {
      const id = $('#event-id').val();

      if (!id || !confirm('Delete this event?')) {
        return;
      }

      $.ajax({
        url: '/api/events/' + id,
        method: 'DELETE'
      }).done(function () {
        closeModal();
        calendar.refetchEvents();
      }).fail(function (xhr) {
        showError(xhr.responseJSON?.message || 'Could not delete the event.');
      });
    });
  });
})();
