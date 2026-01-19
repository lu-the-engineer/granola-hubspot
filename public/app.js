// DOM Elements
const authSection = document.getElementById('auth-section');
const uploadSection = document.getElementById('upload-section');
const resultsSection = document.getElementById('results-section');
const loadingSection = document.getElementById('loading-section');
const passwordInput = document.getElementById('password');
const authBtn = document.getElementById('auth-btn');
const authStatus = document.getElementById('auth-status');
const uploadForm = document.getElementById('upload-form');
const resultsContent = document.getElementById('results-content');

let currentPassword = '';

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
        authSection.classList.add('hidden');
        uploadSection.classList.remove('hidden');
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

// Form submission
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

  // Show loading
  uploadSection.classList.add('hidden');
  resultsSection.classList.add('hidden');
  loadingSection.classList.remove('hidden');

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

    loadingSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    renderResults(result);

  } catch (err) {
    loadingSection.classList.add('hidden');
    uploadSection.classList.remove('hidden');
    alert('Error processing transcript: ' + err.message);
  }
});

function showStatus(element, message, type) {
  element.textContent = message;
  element.className = `status ${type}`;
}

function renderResults(result) {
  const { success, extracted, hubspot, errors } = result;

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

  if (contacts.length > 0 || hubspotContacts.length > 0) {
    html += `
      <div class="result-section">
        <h4>Contacts (${hubspotContacts.length} synced)</h4>
    `;

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

    html += `</div>`;
  }

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

  // Process another button
  html += `
    <button class="btn btn-primary" style="margin-top: 20px;" onclick="resetForm()">
      Process Another Transcript
    </button>
  `;

  resultsContent.innerHTML = html;
}

function resetForm() {
  document.getElementById('transcript').value = '';
  document.getElementById('title').value = '';
  document.getElementById('date').value = '';
  document.getElementById('attendees').value = '';
  resultsSection.classList.add('hidden');
  uploadSection.classList.remove('hidden');
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
