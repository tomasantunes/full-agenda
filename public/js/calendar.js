(function () {
  const modal = $('#event-modal');
  const form = $('#event-form');
  const formError = $('#form-error');
  const deleteButton = $('#delete-event-button');
  const changesList = $('#changes-list');
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

  function formatDateTime(value) {
    if (!value) {
      return 'No date';
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  }

  function describeChange(change) {
    const title = change.after?.title || change.before?.title || 'Untitled event';
    const actionLabels = {
      update: 'Updated',
      delete: 'Deleted',
      restore: 'Restored'
    };

    return {
      title,
      action: actionLabels[change.action] || change.action,
      time: formatDateTime(change.changedAt),
      range: formatDateTime(change.before?.start) + ' to ' + formatDateTime(change.before?.end)
    };
  }

  function loadRecentChanges() {
    changesList.html('<p class="changes-empty">Loading changes...</p>');

    return ajaxJson({
      url: '/api/events/changes',
      method: 'GET'
    }).done(function (changes) {
      if (!changes.length) {
        changesList.html('<p class="changes-empty">No changes tracked yet.</p>');
        return;
      }

      changesList.empty();

      changes.forEach(function (change) {
        const details = describeChange(change);
        const item = $('<article class="change-item"></article>');
        const body = $('<div></div>');
        const heading = $('<h3></h3>').text(details.action + ': ' + details.title);
        const meta = $('<p class="change-meta"></p>').text(details.time + ' | Previous time: ' + details.range);
        const restoreButton = $('<button class="secondary-button restore-button" type="button">Restore</button>');

        restoreButton.on('click', function () {
          if (!confirm('Restore this event to the saved previous version?')) {
            return;
          }

          ajaxJson({
            url: '/api/events/changes/' + change.id + '/restore',
            method: 'POST'
          }).done(function () {
            calendar.refetchEvents();
            loadRecentChanges();
          }).fail(function (xhr) {
            alert(xhr.responseJSON?.message || 'Could not restore the event.');
          });
        });

        body.append(heading, meta);
        item.append(body, restoreButton);
        changesList.append(item);
      });
    }).fail(function () {
      changesList.html('<p class="changes-empty">Could not load recent changes.</p>');
    });
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
    }).done(function () {
      loadRecentChanges();
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
    loadRecentChanges();

    $('#new-event-button').on('click', function () {
      openModal();
    });

    $('#refresh-changes-button').on('click', loadRecentChanges);

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
        loadRecentChanges();
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
        loadRecentChanges();
      }).fail(function (xhr) {
        showError(xhr.responseJSON?.message || 'Could not delete the event.');
      });
    });
  });
})();
