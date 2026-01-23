// DOM Elements
const authSection = document.getElementById('auth-section');
const modeSection = document.getElementById('mode-section');
const granolaSection = document.getElementById('granola-section');
const uploadSection = document.getElementById('upload-section');
const confirmSection = document.getElementById('confirm-section');
const resultsSection = document.getElementById('results-section');
const loadingSection = document.getElementById('loading-section');

const passwordInput = document.getElementById('password');
const authBtn = document.getElementById('auth-btn');
const authStatus = document.getElementById('auth-status');
const uploadForm = document.getElementById('upload-form');
const resultsContent = document.getElementById('results-content');

// Granola elements
const modeGranolaBtn = document.getElementById('mode-granola-btn');
const modePasteBtn = document.getElementById('mode-paste-btn');
const backToModeBtn = document.getElementById('back-to-mode-btn');
const backToModeBtn2 = document.getElementById('back-to-mode-btn-2');
const granolaLoading = document.getElementById('granola-loading');
const granolaError = document.getElementById('granola-error');
const granolaErrorMessage = document.getElementById('granola-error-message');
const granolaRetryBtn = document.getElementById('granola-retry-btn');
const meetingsList = document.getElementById('meetings-list');
const confirmDetails = document.getElementById('confirm-details');
const confirmProcessBtn = document.getElementById('confirm-process-btn');
const confirmBackBtn = document.getElementById('confirm-back-btn');

let currentPassword = '';
let selectedMeeting = null;

// Helper to show/hide sections
function showSection(section) {
  [authSection, modeSection, granolaSection, uploadSection, confirmSection, resultsSection, loadingSection]
    .forEach(s => s.classList.add('hidden'));
  section.classList.remove('hidden');
}

// Authentication
authBtn.addEventListener('click', async () => {
  const password = passwordInput.value.trim();
  if (!password) {
    showStatus(authStatus, 'Please enter a password', 'error');
    return;
  }

  try {
    const response = await fetch('/health', {
      headers: { 'X-Password': password }
    });

    if (response.ok) {
      currentPassword = password;
      showStatus(authStatus, 'Authenticated successfully', 'success');
      setTimeout(() => {
        showSection(modeSection);
      }, 500);
    } else {
      showStatus(authStatus, 'Invalid password', 'error');
    }
  } catch (err) {
    showStatus(authStatus, 'Connection error', 'error');
  }
});

// Allow Enter key for auth
passwordInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    authBtn.click();
  }
});

// Mode selection
modeGranolaBtn.addEventListener('click', () => {
  showSection(granolaSection);
  loadGranolaMeetings();
});

modePasteBtn.addEventListener('click', () => {
  showSection(uploadSection);
});

// Back buttons
backToModeBtn.addEventListener('click', () => {
  showSection(modeSection);
});

backToModeBtn2.addEventListener('click', () => {
  showSection(modeSection);
});

confirmBackBtn.addEventListener('click', () => {
  showSection(granolaSection);
});

// Retry loading meetings
granolaRetryBtn.addEventListener('click', () => {
  loadGranolaMeetings();
});

// Load meetings from Granola
async function loadGranolaMeetings() {
  granolaLoading.classList.remove('hidden');
  granolaError.classList.add('hidden');
  meetingsList.classList.add('hidden');

  try {
    const response = await fetch('/api/granola/meetings?limit=30', {
      headers: {
        'X-Password': currentPassword,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || 'Failed to load meetings');
    }

    granolaLoading.classList.add('hidden');
    renderMeetingsList(data.meetings);
  } catch (err) {
    granolaLoading.classList.add('hidden');
    granolaError.classList.remove('hidden');
    granolaErrorMessage.textContent = err.message;
  }
}

// Render meetings list
function renderMeetingsList(meetings) {
  if (!meetings || meetings.length === 0) {
    meetingsList.innerHTML = '<p class="no-meetings">No meetings found</p>';
    meetingsList.classList.remove('hidden');
    return;
  }

  meetingsList.innerHTML = meetings.map(meeting => {
    const date = new Date(meeting.date);
    const formattedDate = date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    const participantsHtml = meeting.participants.length > 0
      ? `<div class="meeting-participants">
          <div class="meeting-participants-label">Participants</div>
          <div class="participant-chips">
            ${meeting.participants.map(p =>
              `<span class="participant-chip ${p.email ? 'has-email' : ''}" title="${p.email || 'No email'}">${escapeHtml(p.name)}</span>`
            ).join('')}
          </div>
        </div>`
      : '';

    const durationText = meeting.duration ? `${meeting.duration} min` : '';
    const noTranscriptWarning = meeting.hasTranscript === false
      ? `<div class="no-transcript-badge" title="Transcript not in local cache. Open in Granola to sync.">No transcript</div>`
      : '';

    return `
      <div class="meeting-card ${meeting.hasTranscript === false ? 'no-transcript' : ''}" data-meeting-id="${meeting.id}">
        <div class="meeting-card-header">
          <h3 class="meeting-title">${escapeHtml(meeting.title)}</h3>
          <span class="meeting-date">${formattedDate}</span>
        </div>
        ${noTranscriptWarning}
        <div class="meeting-meta">
          ${durationText ? `<span>${durationText}</span>` : ''}
          <span>${meeting.participantCount} participant${meeting.participantCount !== 1 ? 's' : ''}</span>
          ${meeting.hasSummary ? '<span>Has summary</span>' : ''}
        </div>
        ${participantsHtml}
      </div>
    `;
  }).join('');

  meetingsList.classList.remove('hidden');

  // Add click handlers
  meetingsList.querySelectorAll('.meeting-card').forEach(card => {
    card.addEventListener('click', () => {
      const meetingId = card.dataset.meetingId;
      selectMeeting(meetingId);
    });
  });
}

// Select a meeting and show confirmation
async function selectMeeting(meetingId) {
  showSection(loadingSection);

  try {
    const response = await fetch(`/api/granola/meetings/${meetingId}`, {
      headers: {
        'X-Password': currentPassword,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || 'Failed to load meeting');
    }

    selectedMeeting = data.meeting;
    renderConfirmation(selectedMeeting);
    showSection(confirmSection);
  } catch (err) {
    alert('Error loading meeting: ' + err.message);
    showSection(granolaSection);
  }
}

// Render confirmation screen
function renderConfirmation(meeting) {
  const date = new Date(meeting.date);
  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const participantsWithEmail = meeting.participants.filter(p => p.email);
  const participantsWithoutEmail = meeting.participants.filter(p => !p.email);

  let html = `
    <h3>${escapeHtml(meeting.title)}</h3>
    <p><span class="label">Date:</span> ${formattedDate}</p>
    ${meeting.duration ? `<p><span class="label">Duration:</span> ${meeting.duration} minutes</p>` : ''}
  `;

  if (participantsWithEmail.length > 0) {
    html += `
      <p><span class="label">Contacts to sync (${participantsWithEmail.length}):</span></p>
      <div class="participant-chips" style="margin-bottom: 12px;">
        ${participantsWithEmail.map(p =>
          `<span class="participant-chip has-email">${escapeHtml(p.name)} (${escapeHtml(p.email)})</span>`
        ).join('')}
      </div>
    `;
  } else {
    html += `
      <div class="no-contacts-warning" style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
        <p style="color: #92400e; margin: 0 0 12px 0;"><strong>No contacts found.</strong> Enter attendee emails to sync to HubSpot:</p>
        <input type="text" id="manual-emails-input" class="manual-emails-input" placeholder="susan@acme.com, john@acme.com" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 14px;">
        <small style="color: #92400e; display: block; margin-top: 6px;">Comma-separated emails (required)</small>
      </div>
    `;
  }

  if (participantsWithoutEmail.length > 0) {
    html += `
      <p><span class="label">Participants without email (${participantsWithoutEmail.length}):</span></p>
      <div class="participant-chips" style="margin-bottom: 12px;">
        ${participantsWithoutEmail.map(p =>
          `<span class="participant-chip">${escapeHtml(p.name)}</span>`
        ).join('')}
      </div>
    `;
  }

  if (meeting.transcript) {
    const previewText = meeting.transcript.substring(0, 500) + (meeting.transcript.length > 500 ? '...' : '');
    html += `
      <div class="transcript-preview">
        <div class="transcript-preview-label">Transcript Preview</div>
        <div class="transcript-preview-text">${escapeHtml(previewText)}</div>
      </div>
    `;
  } else {
    html += `
      <div class="no-transcript-warning" style="background: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px; padding: 16px; margin-top: 16px;">
        <p style="color: #991b1b; margin: 0 0 12px 0; font-weight: 600;">Transcript not available locally</p>
        <p style="color: #7f1d1d; margin: 0 0 12px 0; font-size: 14px;">
          Granola only keeps recent transcripts in local cache. Older transcripts need to be synced or pasted manually.
        </p>
        <p style="color: #7f1d1d; margin: 0; font-size: 14px;"><strong>To fix this:</strong></p>
        <ul style="color: #7f1d1d; margin: 8px 0 0 20px; font-size: 14px; list-style: disc;">
          <li>Open this meeting in the Granola app to re-sync the transcript</li>
          <li>Or use <strong>Paste Transcript</strong> mode and copy the transcript from Granola's web interface</li>
        </ul>
      </div>
    `;
  }

  confirmDetails.innerHTML = html;
}

// Process selected meeting
confirmProcessBtn.addEventListener('click', async () => {
  if (!selectedMeeting || !selectedMeeting.transcript) {
    alert('No transcript available. Please open this meeting in the Granola app to sync the transcript, or use Paste Transcript mode.');
    return;
  }

  // Get emails from participants or manual input
  let attendeeEmails = selectedMeeting.participants
    .filter(p => p.email)
    .map(p => p.email);

  // If no participant emails, check for manual input
  if (attendeeEmails.length === 0) {
    const manualInput = document.getElementById('manual-emails-input');
    if (manualInput) {
      const manualEmails = manualInput.value.trim();
      if (!manualEmails) {
        alert('Please enter at least one attendee email to sync to HubSpot');
        manualInput.focus();
        return;
      }
      attendeeEmails = manualEmails.split(',').map(e => e.trim()).filter(e => e);
    }
  }

  const payload = {
    transcript: selectedMeeting.transcript,
    title: selectedMeeting.title,
    date: selectedMeeting.date,
    attendees: attendeeEmails.join(', '),
  };

  showSection(loadingSection);

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Password': currentPassword,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    showSection(resultsSection);
    renderResults(result);
  } catch (err) {
    alert('Error processing transcript: ' + err.message);
    showSection(confirmSection);
  }
});

// Form submission (paste mode)
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const transcript = document.getElementById('transcript').value.trim();
  if (!transcript) {
    alert('Please enter a transcript');
    return;
  }

  const payload = {
    transcript,
    title: document.getElementById('title').value.trim() || undefined,
    date: document.getElementById('date').value || undefined,
    attendees: document.getElementById('attendees').value.trim() || undefined,
  };

  showSection(loadingSection);

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Password': currentPassword,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    showSection(resultsSection);
    renderResults(result);
  } catch (err) {
    alert('Error processing transcript: ' + err.message);
    showSection(uploadSection);
  }
});

function showStatus(element, message, type) {
  element.textContent = message;
  element.className = `status ${type}`;
}

function renderResults(result) {
  // Handle API error responses
  if (result.error) {
    resultsContent.innerHTML = `
      <div class="error-list">
        <h4>Error</h4>
        <p>${escapeHtml(result.error)}: ${escapeHtml(result.message || 'Unknown error')}</p>
      </div>
      <div style="margin-top: 20px; display: flex; gap: 12px; flex-wrap: wrap;">
        <button class="btn btn-primary" id="reset-new-btn">
          Try Again
        </button>
      </div>
    `;
    document.getElementById('reset-new-btn').addEventListener('click', () => resetToMode());
    return;
  }

  const { success, extracted, hubspot, errors } = result;

  // Safety check for missing extracted data
  if (!extracted) {
    resultsContent.innerHTML = `
      <div class="error-list">
        <h4>Error</h4>
        <p>No data was extracted from the transcript</p>
      </div>
      <div style="margin-top: 20px; display: flex; gap: 12px; flex-wrap: wrap;">
        <button class="btn btn-primary" id="reset-new-btn">
          Try Again
        </button>
      </div>
    `;
    document.getElementById('reset-new-btn').addEventListener('click', () => resetToMode());
    return;
  }

  let html = '';

  // Summary banner
  if (success) {
    html += `
      <div class="result-summary">
        <h3>Processing Complete</h3>
        <p>Transcript analyzed and synced to HubSpot</p>
      </div>
    `;
  }

  // Call Summary
  html += `
    <div class="result-section">
      <h4>Call Summary</h4>
      <div class="result-item">
        <p>${escapeHtml(extracted.callSummary)}</p>
        <p style="margin-top: 8px;">
          <strong>Sentiment:</strong>
          <span class="sentiment-${extracted.sentiment}">${capitalize(extracted.sentiment)}</span>
        </p>
      </div>
    </div>
  `;

  // Contacts Info (now supports multiple)
  const contacts = extracted.contacts || [];
  const hubspotContacts = hubspot.contacts || [];

  html += `<div class="result-section">`;

  if (contacts.length === 0 && hubspotContacts.length === 0) {
    html += `
      <h4>Contacts</h4>
      <div class="result-item" style="color: #6b7280;">
        <p>No contacts to sync. To sync contacts to HubSpot:</p>
        <ul style="margin-top: 8px; margin-left: 20px; list-style: disc;">
          <li>Add external attendees to the calendar event</li>
          <li>Or mention contact details in the transcript</li>
        </ul>
      </div>
    `;
  } else {
    html += `<h4>Contacts (${hubspotContacts.length} synced)</h4>`;

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const hsContact = hubspotContacts[i];

      html += `<div class="result-item" style="margin-bottom: 12px;">`;

      if (contact.firstName || contact.lastName) {
        html += `<p><strong>Name:</strong> ${escapeHtml(contact.firstName || '')} ${escapeHtml(contact.lastName || '')}</p>`;
      }
      if (contact.email) {
        html += `<p><strong>Email:</strong> ${escapeHtml(contact.email)}</p>`;
      }
      if (contact.company) {
        html += `<p><strong>Company:</strong> ${escapeHtml(contact.company)}</p>`;
      }
      if (contact.jobTitle) {
        html += `<p><strong>Title:</strong> ${escapeHtml(contact.jobTitle)}</p>`;
      }

      if (hsContact) {
        html += `
          <p style="margin-top: 8px;">
            <strong>HubSpot:</strong>
            <a href="${hsContact.url}" target="_blank">
              ${capitalize(hsContact.action)} (ID: ${hsContact.id})
            </a>
          </p>
        `;
      }

      html += `</div>`;
    }
  }

  html += `</div>`;

  // Deal Info
  if (hubspot.deal || extracted.deal.name) {
    html += `
      <div class="result-section">
        <h4>Deal</h4>
        <div class="result-item">
    `;

    if (extracted.deal.name) {
      html += `<p><strong>Name:</strong> ${escapeHtml(extracted.deal.name)}</p>`;
    }
    if (extracted.deal.stage) {
      html += `<p><strong>Stage:</strong> ${capitalize(extracted.deal.stage.replace('_', ' '))}</p>`;
    }
    if (extracted.deal.amount) {
      html += `<p><strong>Amount:</strong> $${extracted.deal.amount.toLocaleString()}</p>`;
    }

    if (hubspot.deal) {
      html += `
        <p style="margin-top: 8px;">
          <strong>HubSpot:</strong>
          <a href="${hubspot.deal.url}" target="_blank">
            ${capitalize(hubspot.deal.action)} (ID: ${hubspot.deal.id})
          </a>
        </p>
      `;
    }

    html += `</div></div>`;
  }

  // Action Items
  if (extracted.actionItems && extracted.actionItems.length > 0) {
    html += `
      <div class="result-section">
        <h4>Action Items</h4>
        <ul class="result-list">
          ${extracted.actionItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  // Next Steps
  if (extracted.nextSteps && extracted.nextSteps.length > 0) {
    html += `
      <div class="result-section">
        <h4>Next Steps</h4>
        <ul class="result-list">
          ${extracted.nextSteps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  // Errors
  if (errors && errors.length > 0) {
    html += `
      <div class="error-list">
        <h4>Warnings</h4>
        <ul>
          ${errors.map(err => `<li>${escapeHtml(err)}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  // Process another buttons
  html += `
    <div style="margin-top: 20px; display: flex; gap: 12px; flex-wrap: wrap;">
      <button class="btn btn-primary" id="reset-new-btn">
        Process Another Meeting
      </button>
    </div>
    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 14px; color: #6b7280; margin-bottom: 12px;">Create follow-up tasks:</p>
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <button class="btn btn-secondary" id="create-jira-btn">
          Create Jira Ticket
        </button>
        <button class="btn btn-secondary" id="create-trello-themes-btn">
          Trello: Themes
        </button>
        <button class="btn btn-secondary" id="create-trello-artwork-btn">
          Trello: Artwork
        </button>
      </div>
    </div>
  `;

  resultsContent.innerHTML = html;

  // Store extracted data for ticket creation
  const ticketData = {
    title: extracted.meetingTitle || 'Meeting Follow-up',
    summary: extracted.callSummary || '',
    actionItems: extracted.actionItems || [],
    nextSteps: extracted.nextSteps || [],
    contacts: extracted.contacts || [],
    transcript: selectedMeeting?.transcript || '',
  };

  // Attach event listeners after rendering
  document.getElementById('reset-new-btn').addEventListener('click', () => resetToMode());
  document.getElementById('create-jira-btn').addEventListener('click', () => openJiraTicket(ticketData));
  document.getElementById('create-trello-themes-btn').addEventListener('click', () => openTrelloCard(ticketData, 'themes'));
  document.getElementById('create-trello-artwork-btn').addEventListener('click', () => openTrelloCard(ticketData, 'artwork'));
}

function resetToMode() {
  selectedMeeting = null;
  document.getElementById('transcript').value = '';
  document.getElementById('title').value = '';
  document.getElementById('date').value = '';
  document.getElementById('attendees').value = '';
  showSection(modeSection);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Build ticket description from extracted data
function buildTicketDescription(data) {
  let desc = '';

  if (data.summary) {
    desc += `**Summary:**\n${data.summary}\n\n`;
  }

  if (data.contacts && data.contacts.length > 0) {
    const contactNames = data.contacts
      .map(c => [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email)
      .filter(Boolean);
    if (contactNames.length > 0) {
      desc += `**Contacts:** ${contactNames.join(', ')}\n\n`;
    }
  }

  if (data.actionItems && data.actionItems.length > 0) {
    desc += `**Action Items:**\n${data.actionItems.map(item => `- ${item}`).join('\n')}\n\n`;
  }

  if (data.nextSteps && data.nextSteps.length > 0) {
    desc += `**Next Steps:**\n${data.nextSteps.map(step => `- ${step}`).join('\n')}\n\n`;
  }

  return desc.trim();
}

// Open Jira ticket creation page
function openJiraTicket(data) {
  const summary = encodeURIComponent(data.title);
  const description = encodeURIComponent(buildTicketDescription(data));

  const url = `https://popshop.atlassian.net/secure/CreateIssueDetails!init.jspa?pid=10122&issuetype=10229&summary=${summary}&description=${description}`;

  window.open(url, '_blank');
}

// Open Trello card creation page
function openTrelloCard(data, board) {
  const boardIds = {
    themes: 'fgpirgTw',
    artwork: 'gkrfz0WM',
  };

  const boardId = boardIds[board];
  if (!boardId) return;

  const name = encodeURIComponent(data.title);
  const desc = encodeURIComponent(buildTicketDescription(data));

  // Trello add card URL
  const url = `https://trello.com/add-card?name=${name}&desc=${desc}&idBoard=${boardId}&mode=popup`;

  window.open(url, '_blank');
}
