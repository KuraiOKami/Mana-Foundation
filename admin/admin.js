import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore,
  collection,
  getDocs,
  orderBy,
  query,
  limit,
  addDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const config = window.firebaseConfig;
const root = document.querySelector('main');
const loginSection = document.querySelector('[data-view="login"]');
const appSection = document.querySelector('[data-view="app"]');
const loginErrorEl = document.getElementById('login-error');
const dataErrorEl = document.getElementById('data-error');
const userPanel = document.querySelector('.user-panel');
const userEmailEl = document.getElementById('user-email');
const refreshBtn = document.getElementById('refresh');
const signOutBtn = document.getElementById('sign-out');

const navButtons = document.querySelectorAll('[data-nav]');
const panels = document.querySelectorAll('[data-section]');

const metricDonations = document.getElementById('metric-donations');
const metricWishlist = document.getElementById('metric-wishlist');
const metricRequests = document.getElementById('metric-requests');

const donationsList = document.getElementById('donations-list');
const donationsCount = document.getElementById('donations-count');
const donationsTable = document.getElementById('donations-table');

const wishlistList = document.getElementById('wishlist-list');
const wishlistCount = document.getElementById('wishlist-count');
const wishlistTable = document.getElementById('wishlist-table');
const wishlistForm = document.getElementById('wishlist-form');
const wishlistStatus = document.getElementById('wishlist-status');

const requestsList = document.getElementById('requests-list');
const requestsCount = document.getElementById('requests-count');
const requestsTable = document.getElementById('requests-table');

const globalSearch = document.getElementById('global-search');
const quickAddDonor = document.getElementById('quick-add-donor');
const quickAddProject = document.getElementById('quick-add-project');
const quickAddMessage = document.getElementById('quick-add-message');

const donorForm = document.getElementById('donor-form');
const donorStatus = document.getElementById('donor-status');
const donorTable = document.getElementById('donor-table');
const donorSearch = document.getElementById('donor-search');

const messageForm = document.getElementById('message-form');
const messageStatus = document.getElementById('message-status');
const messagesTable = document.getElementById('messages-table');

const projectForm = document.getElementById('project-form');
const projectStatus = document.getElementById('project-status');
const projectsTable = document.getElementById('projects-table');

const fmtCurrency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmtDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

if (!config || !config.apiKey) {
  loginSection.innerHTML = '<p class="error">Missing Firebase configuration. Update admin/firebase-config.js.</p>';
  throw new Error('Firebase config missing');
}

const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence).catch(() => {});

const state = {
  donations: [],
  wishlist: [],
  requests: [],
  donors: [],
  projects: [],
  messages: [],
  filters: {
    global: '',
    donor: ''
  }
};

const loginForm = document.getElementById('login-form');
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginErrorEl.textContent = '';
  const formData = new FormData(loginForm);
  const email = formData.get('email')?.trim();
  const password = formData.get('password');
  if (!email || !password) return;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    loginErrorEl.textContent = error.message;
  }
});

signOutBtn.addEventListener('click', () => signOut(auth));
refreshBtn.addEventListener('click', () => refreshData());

navButtons.forEach((button) =>
  button.addEventListener('click', () => {
    setActivePanel(button.dataset.nav);
  })
);

globalSearch?.addEventListener('input', (event) => {
  state.filters.global = event.target.value || '';
  renderDonorTable();
  renderProjectsTable();
});

donorSearch?.addEventListener('input', (event) => {
  state.filters.donor = event.target.value || '';
  renderDonorTable();
});

quickAddDonor?.addEventListener('click', () => {
  setActivePanel('donors');
  donorForm?.querySelector('input[name="name"]')?.focus();
});

quickAddProject?.addEventListener('click', () => {
  setActivePanel('projects');
  projectForm?.querySelector('input[name="title"]')?.focus();
});

quickAddMessage?.addEventListener('click', () => {
  setActivePanel('communications');
  messageForm?.querySelector('input[name="subject"]')?.focus();
});

wishlistForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  wishlistStatus.textContent = '';
  if (!auth.currentUser) {
    wishlistStatus.textContent = 'Sign in required.';
    return;
  }
  const formData = new FormData(wishlistForm);
  const payload = {
    program: formData.get('program')?.trim() || 'General',
    title: formData.get('title')?.trim() || 'Untitled item',
    price: Number(formData.get('price')) || 0,
    quantityNeeded: Number(formData.get('quantity')) || 0,
    quantityFunded: 0,
    image: formData.get('image')?.trim() || '',
    notes: formData.get('notes')?.trim() || '',
    createdAt: serverTimestamp()
  };
  try {
    await addDoc(collection(db, 'wishlistItems'), payload);
    wishlistForm.reset();
    wishlistStatus.textContent = '✅ Item added.';
    refreshData();
  } catch (error) {
    console.error(error);
    wishlistStatus.textContent = 'Unable to add item. Check Firestore permissions.';
  }
});

donorForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  donorStatus.textContent = '';
  if (!auth.currentUser) {
    donorStatus.textContent = 'Sign in required.';
    return;
  }
  const formData = new FormData(donorForm);
  const payload = {
    name: formData.get('name')?.trim(),
    email: formData.get('email')?.trim(),
    phone: formData.get('phone')?.trim() || '',
    tier: formData.get('tier') || 'general',
    source: formData.get('source')?.trim() || '',
    tags: parseTags(formData.get('tags')),
    notes: formData.get('notes')?.trim() || '',
    lastContacted: serverTimestamp(),
    createdAt: serverTimestamp()
  };
  if (!payload.name || !payload.email) {
    donorStatus.textContent = 'Name and email are required.';
    return;
  }
  try {
    await addDoc(collection(db, 'donors'), payload);
    donorForm.reset();
    donorStatus.textContent = '✅ Donor saved';
    refreshData();
  } catch (error) {
    console.error(error);
    donorStatus.textContent = 'Unable to save donor. Check Firestore permissions.';
  }
});

messageForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  messageStatus.textContent = '';
  if (!auth.currentUser) {
    messageStatus.textContent = 'Sign in required.';
    return;
  }
  const formData = new FormData(messageForm);
  const payload = {
    subject: formData.get('subject')?.trim(),
    segment: formData.get('segment'),
    channel: formData.get('channel'),
    body: formData.get('body')?.trim(),
    sendDate: formData.get('sendDate') || '',
    status: 'queued',
    createdAt: serverTimestamp()
  };
  if (!payload.subject || !payload.body) {
    messageStatus.textContent = 'Subject and message are required.';
    return;
  }
  try {
    await addDoc(collection(db, 'communications'), payload);
    messageForm.reset();
    messageStatus.textContent = '✅ Update queued';
    refreshData();
  } catch (error) {
    console.error(error);
    messageStatus.textContent = 'Unable to queue message.';
  }
});

projectForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  projectStatus.textContent = '';
  if (!auth.currentUser) {
    projectStatus.textContent = 'Sign in required.';
    return;
  }
  const formData = new FormData(projectForm);
  const payload = {
    title: formData.get('title')?.trim(),
    owner: formData.get('owner')?.trim() || 'Unassigned',
    stage: formData.get('stage') || 'intake',
    budget: Number(formData.get('budget')) || 0,
    targetDate: formData.get('targetDate') || '',
    notes: formData.get('notes')?.trim() || '',
    createdAt: serverTimestamp()
  };
  if (!payload.title) {
    projectStatus.textContent = 'Title is required.';
    return;
  }
  try {
    await addDoc(collection(db, 'projects'), payload);
    projectForm.reset();
    projectStatus.textContent = '✅ Project added';
    refreshData();
  } catch (error) {
    console.error(error);
    projectStatus.textContent = 'Unable to save project.';
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    root.dataset.state = 'authenticated';
    userPanel.dataset.auth = 'signed-in';
    userEmailEl.textContent = user.email ?? 'Admin';
    setActivePanel('dashboard');
    refreshData();
  } else {
    root.dataset.state = 'signed-out';
    userPanel.dataset.auth = 'signed-out';
    userEmailEl.textContent = '—';
    clearUI();
  }
});

function setActivePanel(panelId) {
  navButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.nav === panelId);
  });
  panels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.section === panelId);
  });
}

function clearUI() {
  metricDonations.textContent = '—';
  metricWishlist.textContent = '—';
  metricRequests.textContent = '—';
  donationsList.innerHTML = '';
  donationsTable.innerHTML = '<p class="placeholder">Sign in to view donations.</p>';
  wishlistList.innerHTML = '';
  wishlistTable.innerHTML = '<p class="placeholder">Sign in to manage the wish list.</p>';
  requestsList.innerHTML = '';
  requestsTable.innerHTML = '<p class="placeholder">Sign in to view support requests.</p>';
  donationsCount.textContent = '0';
  wishlistCount.textContent = '0';
  requestsCount.textContent = '0';
  donorTable.innerHTML = '<p class="placeholder">Sign in to manage donors.</p>';
  messagesTable.innerHTML = '<p class="placeholder">Sign in to manage communications.</p>';
  projectsTable.innerHTML = '<p class="placeholder">Sign in to manage projects.</p>';
}

async function refreshData() {
  if (!auth.currentUser) return;
  setLoading(true);
  dataErrorEl.textContent = '';
  try {
    const [donations, wishlist, requests, donors, projects, messages] = await Promise.all([
      fetchCollection('donations', { orderByField: 'createdAt', orderDirection: 'desc', limitTo: 12 }),
      fetchCollection('wishlistItems', { orderByField: 'title' }),
      fetchCollection('supportRequests', { orderByField: 'createdAt', orderDirection: 'desc', limitTo: 12 }),
      fetchCollection('donors', { orderByField: 'name' }),
      fetchCollection('projects', { orderByField: 'createdAt', orderDirection: 'desc', limitTo: 50 }),
      fetchCollection('communications', { orderByField: 'createdAt', orderDirection: 'desc', limitTo: 50 })
    ]);
    state.donations = donations;
    state.wishlist = wishlist;
    state.requests = requests;
    state.donors = donors;
    state.projects = projects;
    state.messages = messages;
    renderDashboard(donations, wishlist, requests);
    renderWishlistManager();
    renderDonationsTable();
    renderRequestsTable();
    renderDonorTable();
    renderProjectsTable();
    renderMessagesTable();
  } catch (error) {
    console.error(error);
    dataErrorEl.textContent = 'Unable to load data. Check Firestore rules or network.';
  } finally {
    setLoading(false);
  }
}

async function fetchCollection(name, options = {}) {
  const colRef = collection(db, name);
  let qRef = colRef;
  if (options.orderByField) {
    qRef = query(qRef, orderBy(options.orderByField, options.orderDirection || 'asc'));
  }
  if (options.limitTo) {
    qRef = query(qRef, limit(options.limitTo));
  }
  const snapshot = await getDocs(qRef);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function renderDashboard(donations, wishlist, requests) {
  renderDonationsSummary(donations);
  renderWishlistSummary(wishlist);
  renderRequestsSummary(requests);
}

function renderDonationsSummary(rows) {
  donationsCount.textContent = String(rows.length);
  if (!rows.length) {
    donationsList.innerHTML = '<li>No donations recorded.</li>';
    metricDonations.textContent = fmtCurrency.format(0);
    return;
  }
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  metricDonations.textContent = fmtCurrency.format(total);
  donationsList.innerHTML = rows
    .slice(0, 6)
    .map((row) => {
      const donor = row.donorName || row.email || 'Anonymous';
      const amount = fmtCurrency.format(row.amount || 0);
      const date = renderDate(row.createdAt);
      const program = row.program || row.programName || 'General';
      return `<li><strong>${donor}</strong> pledged <strong>${amount}</strong><br><small>${program} · ${date}</small></li>`;
    })
    .join('');
}

function renderWishlistSummary(rows) {
  wishlistCount.textContent = String(rows.length);
  if (!rows.length) {
    wishlistList.innerHTML = '<li>No active wish list items.</li>';
    metricWishlist.textContent = '0 / 0';
    return;
  }
  const funded = rows.reduce((sum, row) => sum + Number(row.quantityFunded || 0), 0);
  const needed = rows.reduce((sum, row) => sum + Number(row.quantityNeeded || 0), 0);
  metricWishlist.textContent = `${funded} / ${needed || '?'} items`;
  wishlistList.innerHTML = rows
    .slice(0, 6)
    .map((row) => {
      const percent = progressPercent(row);
      return `<li><strong>${row.title || row.name}</strong><br><small>${row.quantityFunded || 0} of ${row.quantityNeeded || '?'} funded · ${percent}%</small></li>`;
    })
    .join('');
}

function renderRequestsSummary(rows) {
  requestsCount.textContent = String(rows.length);
  if (!rows.length) {
    requestsList.innerHTML = '<li>No support requests logged.</li>';
    metricRequests.textContent = '0';
    return;
  }
  const openCount = rows.filter((row) => (row.status || 'open') === 'open').length;
  metricRequests.textContent = String(openCount);
  requestsList.innerHTML = rows
    .slice(0, 6)
    .map((row) => {
      const requester = row.name || 'Neighbor';
      const need = row.need || row.summary || '—';
      const date = renderDate(row.createdAt);
      const status = row.status || 'open';
      return `<li><strong>${requester}</strong> · ${status}<br><small>${need}<br>${date}</small></li>`;
    })
    .join('');
}

function renderWishlistManager() {
  const rows = state.wishlist;
  if (!rows.length) {
    wishlistTable.innerHTML = '<p class="placeholder">No wish list items yet.</p>';
    return;
  }
  wishlistTable.innerHTML = rows
    .map((row) => {
      const percent = progressPercent(row);
      const price = fmtCurrency.format(row.price || 0);
      return `
        <div class="row">
          <div>
            <strong>${row.title || 'Untitled item'}</strong>
            <small>${row.program || 'General'} · ${row.quantityFunded || 0}/${row.quantityNeeded || '?'} funded (${percent}%)</small>
          </div>
          <div>
            <strong>${price}</strong>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderDonationsTable() {
  const rows = state.donations;
  if (!rows.length) {
    donationsTable.innerHTML = '<p class="placeholder">No donations captured yet.</p>';
    return;
  }
  donationsTable.innerHTML = rows
    .map((row) => {
      const donor = row.donorName || row.email || 'Anonymous';
      const amount = fmtCurrency.format(row.amount || 0);
      const date = renderDate(row.createdAt);
      const program = row.program || row.programName || 'General';
      return `
        <div class="row">
          <div>
            <strong>${donor}</strong>
            <small>${program} · ${date}</small>
          </div>
          <div>
            <strong>${amount}</strong>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderRequestsTable() {
  const rows = state.requests;
  if (!rows.length) {
    requestsTable.innerHTML = '<p class="placeholder">No requests captured yet.</p>';
    return;
  }
  requestsTable.innerHTML = rows
    .map((row) => {
      const requester = row.name || 'Neighbor';
      const status = row.status || 'open';
      const date = renderDate(row.createdAt);
      const need = row.need || row.summary || '—';
      return `
        <div class="row">
          <div>
            <strong>${requester}</strong>
            <small>${status} · ${date}</small>
            <small>${need}</small>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderDonorTable() {
  let rows = state.donors;
  const donorTerm = (state.filters.donor || '').trim().toLowerCase();
  const globalTerm = (state.filters.global || '').trim().toLowerCase();
  if (donorTerm) rows = filterBySearch(rows, donorTerm);
  if (globalTerm) rows = filterBySearch(rows, globalTerm);
  if (!rows.length) {
    donorTable.innerHTML = '<p class="placeholder">No donors found.</p>';
    return;
  }
  donorTable.innerHTML = rows
    .map((row) => {
      const name = row.name || 'Unnamed donor';
      const email = row.email || '—';
      const tier = row.tier || 'general';
      const tags = Array.isArray(row.tags) ? row.tags.join(', ') : row.tags || '';
      const lastGift = row.lastGiftAmount ? fmtCurrency.format(row.lastGiftAmount) : '—';
      const lastContact = renderDate(row.lastContacted || row.createdAt);
      return `
        <div class="row donor">
          <div>
            <strong>${name}</strong>
            <small>${email}</small>
            <small>${tags || 'No tags'}</small>
          </div>
          <div class="badge secondary">${tier}</div>
          <div>
            <strong>${lastGift}</strong>
            <small>Last contact: ${lastContact}</small>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderProjectsTable() {
  const rows = state.projects;
  const term = (state.filters.global || '').trim().toLowerCase();
  const filtered = term ? rows.filter((row) => textMatch(row.title, term) || textMatch(row.notes, term)) : rows;
  if (!filtered.length) {
    projectsTable.innerHTML = '<p class="placeholder">No projects logged.</p>';
    return;
  }
  projectsTable.innerHTML = filtered
    .map((row) => {
      const stage = row.stage || 'intake';
      const owner = row.owner || 'Unassigned';
      const budget = row.budget ? fmtCurrency.format(row.budget) : '—';
      const target = row.targetDate || '—';
      const created = renderDate(row.createdAt);
      return `
        <div class="row project">
          <div>
            <strong>${row.title || 'Untitled project'}</strong>
            <small>${owner} · Stage: ${stage}</small>
            <small>Created ${created}</small>
          </div>
          <div>
            <strong>${budget}</strong>
            <small>Target: ${target}</small>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderMessagesTable() {
  const rows = state.messages;
  if (!rows.length) {
    messagesTable.innerHTML = '<p class="placeholder">No communications logged.</p>';
    return;
  }
  messagesTable.innerHTML = rows
    .map((row) => {
      const subject = row.subject || 'Untitled';
      const channel = row.channel || 'email';
      const segment = row.segment || 'all';
      const status = row.status || 'queued';
      const sendDate = row.sendDate || 'Asap';
      const created = renderDate(row.createdAt);
      return `
        <div class="row message">
          <div>
            <strong>${subject}</strong>
            <small>${channel.toUpperCase()} · Segment: ${segment}</small>
            <small>Created ${created}</small>
          </div>
          <div>
            <strong>${status}</strong>
            <small>Send: ${sendDate}</small>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderDate(timestamp) {
  if (!timestamp) return '—';
  if (typeof timestamp.toDate === 'function') {
    return fmtDate.format(timestamp.toDate());
  }
  if (timestamp.seconds) {
    return fmtDate.format(new Date(timestamp.seconds * 1000));
  }
  return '—';
}

function progressPercent(row) {
  const needed = Number(row.quantityNeeded || 0) || 0;
  if (!needed) return 0;
  return Math.min(100, Math.round(((row.quantityFunded || 0) / needed) * 100));
}

function setLoading(isLoading) {
  refreshBtn.disabled = isLoading;
  refreshBtn.textContent = isLoading ? 'Refreshing…' : 'Refresh data';
}

function parseTags(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function filterBySearch(rows, term) {
  if (!term) return rows;
  return rows.filter((row) => {
    return (
      textMatch(row.name, term) ||
      textMatch(row.email, term) ||
      textMatch(row.tags, term) ||
      textMatch(row.notes, term) ||
      textMatch(row.tier, term) ||
      textMatch(row.source, term)
    );
  });
}

function textMatch(field, term) {
  if (!field) return false;
  if (Array.isArray(field)) return field.some((entry) => textMatch(entry, term));
  return String(field).toLowerCase().includes(term);
}
