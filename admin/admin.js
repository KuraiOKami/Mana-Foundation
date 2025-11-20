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
  doc,
  orderBy,
  query,
  limit,
  addDoc,
  updateDoc,
  deleteDoc,
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
const metricDonors = document.getElementById('metric-donors');
const metricRecurring = document.getElementById('metric-recurring');

const donationsList = document.getElementById('donations-list');
const donationsCount = document.getElementById('donations-count');
const donationsTable = document.getElementById('donations-table');
const donationForm = document.getElementById('donation-form');
const donationStatus = document.getElementById('donation-status');

const wishlistList = document.getElementById('wishlist-list');
const wishlistCount = document.getElementById('wishlist-count');
const wishlistTable = document.getElementById('wishlist-table');
const wishlistForm = document.getElementById('wishlist-form');
const wishlistStatus = document.getElementById('wishlist-status');
const wishlistGauge = document.getElementById('wishlist-gauge');

const requestsList = document.getElementById('requests-list');
const requestsCount = document.getElementById('requests-count');
const requestsTable = document.getElementById('requests-table');
const donorActivityList = document.getElementById('donor-activity-list');
const donorActivityCount = document.getElementById('donor-activity-count');
const programActivityList = document.getElementById('program-activity');
const donationsChart = document.getElementById('donations-chart');
const donorTimeline = document.getElementById('donor-timeline');

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
  selected: {
    donorId: null,
    wishlistId: null,
    projectId: null
  },
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

donationForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  donationStatus.textContent = '';
  if (!auth.currentUser) {
    donationStatus.textContent = 'Sign in required.';
    return;
  }
  const formData = new FormData(donationForm);
  const payload = {
    donorName: formData.get('donorName')?.trim() || 'Anonymous',
    email: formData.get('email')?.trim() || '',
    program: formData.get('program')?.trim() || 'General',
    amount: Number(formData.get('amount')) || 0,
    source: formData.get('source') || 'manual',
    createdAt: serverTimestamp()
  };
  if (!payload.amount) {
    donationStatus.textContent = 'Amount is required.';
    return;
  }
  try {
    await addDoc(collection(db, 'donations'), payload);
    donationForm.reset();
    donationStatus.textContent = '✅ Donation recorded';
    refreshData();
  } catch (error) {
    console.error(error);
    donationStatus.textContent = 'Unable to record donation.';
  }
});

wishlistTable?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  if (!action || !id) return;
  if (action === 'edit-wishlist') {
    loadWishlistForm(id);
  }
  if (action === 'delete-wishlist') {
    deleteWishlistItem(id);
  }
});

donorTable?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  if (!action || !id) return;
  if (action === 'edit-donor') {
    loadDonorForm(id);
  }
  if (action === 'delete-donor') {
    deleteDonor(id);
  }
});

projectsTable?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  if (!action || !id) return;
  if (action === 'edit-project') {
    loadProjectForm(id);
  }
  if (action === 'delete-project') {
    deleteProject(id);
  }
});

requestsTable?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  if (!action || !id) return;
  if (action === 'resolve-request') {
    updateRequestStatus(id, 'resolved');
  }
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
    category: formData.get('category') || 'general',
    title: formData.get('title')?.trim() || 'Untitled item',
    price: Number(formData.get('price')) || 0,
    quantityNeeded: Number(formData.get('quantity')) || 0,
    quantityFunded: Number(formData.get('quantityFunded')) || 0,
    priority: formData.get('priority') || 'medium',
    image: formData.get('image')?.trim() || '',
    notes: formData.get('notes')?.trim() || ''
  };
  try {
    if (state.selected.wishlistId) {
      await updateDoc(doc(db, 'wishlistItems', state.selected.wishlistId), payload);
      wishlistStatus.textContent = '✅ Item updated.';
    } else {
      await addDoc(collection(db, 'wishlistItems'), { ...payload, createdAt: serverTimestamp() });
      wishlistStatus.textContent = '✅ Item added.';
    }
    state.selected.wishlistId = null;
    wishlistForm.reset();
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
    contactPreference: formData.get('contactPreference') || 'email',
    tags: parseTags(formData.get('tags')),
    notes: formData.get('notes')?.trim() || '',
    lastContacted: serverTimestamp()
  };
  if (!payload.name || !payload.email) {
    donorStatus.textContent = 'Name and email are required.';
    return;
  }
  try {
    if (state.selected.donorId) {
      await updateDoc(doc(db, 'donors', state.selected.donorId), payload);
      donorStatus.textContent = '✅ Donor updated';
    } else {
      await addDoc(collection(db, 'donors'), { ...payload, createdAt: serverTimestamp() });
      donorStatus.textContent = '✅ Donor saved';
    }
    state.selected.donorId = null;
    donorForm.reset();
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
    relatedEmail: formData.get('relatedEmail')?.trim() || '',
    body: formData.get('body')?.trim(),
    tags: parseTags(formData.get('tags')),
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

async function deleteDonor(id) {
  if (!auth.currentUser || !id) return;
  try {
    await deleteDoc(doc(db, 'donors', id));
    donorStatus.textContent = 'Donor deleted.';
    if (state.selected.donorId === id) state.selected.donorId = null;
    refreshData();
  } catch (error) {
    console.error(error);
    donorStatus.textContent = 'Unable to delete donor.';
  }
}

function loadDonorForm(id) {
  const row = state.donors.find((d) => d.id === id);
  if (!row || !donorForm) return;
  state.selected.donorId = id;
  donorForm.querySelector('input[name="name"]').value = row.name || '';
  donorForm.querySelector('input[name="email"]').value = row.email || '';
  donorForm.querySelector('input[name="phone"]').value = row.phone || '';
  donorForm.querySelector('select[name="tier"]').value = row.tier || 'general';
  donorForm.querySelector('input[name="source"]').value = row.source || '';
  donorForm.querySelector('select[name="contactPreference"]').value = row.contactPreference || 'email';
  donorForm.querySelector('input[name="tags"]').value = Array.isArray(row.tags) ? row.tags.join(', ') : row.tags || '';
  donorForm.querySelector('textarea[name="notes"]').value = row.notes || '';
  donorStatus.textContent = 'Editing donor…';
  renderDonorTimeline();
}

async function deleteWishlistItem(id) {
  if (!auth.currentUser || !id) return;
  try {
    await deleteDoc(doc(db, 'wishlistItems', id));
    wishlistStatus.textContent = 'Item deleted.';
    if (state.selected.wishlistId === id) state.selected.wishlistId = null;
    refreshData();
  } catch (error) {
    console.error(error);
    wishlistStatus.textContent = 'Unable to delete item.';
  }
}

function loadWishlistForm(id) {
  const row = state.wishlist.find((w) => w.id === id);
  if (!row || !wishlistForm) return;
  state.selected.wishlistId = id;
  wishlistForm.querySelector('input[name="program"]').value = row.program || '';
  wishlistForm.querySelector('select[name="category"]').value = row.category || 'general';
  wishlistForm.querySelector('input[name="title"]').value = row.title || '';
  wishlistForm.querySelector('input[name="price"]').value = row.price || '';
  wishlistForm.querySelector('input[name="quantity"]').value = row.quantityNeeded || '';
  wishlistForm.querySelector('input[name="quantityFunded"]').value = row.quantityFunded || '';
  wishlistForm.querySelector('select[name="priority"]').value = row.priority || 'medium';
  wishlistForm.querySelector('input[name="image"]').value = row.image || '';
  wishlistForm.querySelector('textarea[name="notes"]').value = row.notes || '';
  wishlistStatus.textContent = 'Editing item…';
}

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
    notes: formData.get('notes')?.trim() || ''
  };
  if (!payload.title) {
    projectStatus.textContent = 'Title is required.';
    return;
  }
  try {
    if (state.selected.projectId) {
      await updateDoc(doc(db, 'projects', state.selected.projectId), payload);
      projectStatus.textContent = '✅ Project updated';
    } else {
      await addDoc(collection(db, 'projects'), { ...payload, createdAt: serverTimestamp() });
      projectStatus.textContent = '✅ Project added';
    }
    state.selected.projectId = null;
    projectForm.reset();
    refreshData();
  } catch (error) {
    console.error(error);
    projectStatus.textContent = 'Unable to save project.';
  }
});

async function deleteProject(id) {
  if (!auth.currentUser || !id) return;
  try {
    await deleteDoc(doc(db, 'projects', id));
    projectStatus.textContent = 'Project deleted.';
    if (state.selected.projectId === id) state.selected.projectId = null;
    refreshData();
  } catch (error) {
    console.error(error);
    projectStatus.textContent = 'Unable to delete project.';
  }
}

function loadProjectForm(id) {
  const row = state.projects.find((p) => p.id === id);
  if (!row || !projectForm) return;
  state.selected.projectId = id;
  projectForm.querySelector('input[name="title"]').value = row.title || '';
  projectForm.querySelector('input[name="owner"]').value = row.owner || '';
  projectForm.querySelector('select[name="stage"]').value = row.stage || 'intake';
  projectForm.querySelector('input[name="budget"]').value = row.budget || '';
  projectForm.querySelector('input[name="targetDate"]').value = row.targetDate || '';
  projectForm.querySelector('textarea[name="notes"]').value = row.notes || '';
  projectStatus.textContent = 'Editing project…';
}

async function updateRequestStatus(id, status) {
  if (!auth.currentUser || !id) return;
  try {
    await updateDoc(doc(db, 'supportRequests', id), { status });
    refreshData();
  } catch (error) {
    console.error(error);
    dataErrorEl.textContent = 'Unable to update request.';
  }
}

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
  if (donorTimeline) donorTimeline.innerHTML = '<li>Sign in to view timeline.</li>';
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
    renderDashboard();
    renderWishlistManager();
    renderDonationsTable();
    renderRequestsTable();
    renderDonorTable();
    renderProjectsTable();
    renderMessagesTable();
    renderDonorTimeline();
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

function renderDashboard() {
  renderKpis();
  renderDonationsSummary(state.donations);
  renderWishlistSummary(state.wishlist);
  renderRequestsSummary(state.requests);
  renderDonorActivity();
  renderProgramActivity();
  renderWishlistGauge();
  renderDonationChart();
}

function renderKpis() {
  metricDonors.textContent = state.donors.length ? String(state.donors.length) : '0';
  const recurring = state.donors.filter((d) => (d.tier || '').toLowerCase() === 'recurring').length;
  metricRecurring.textContent = String(recurring);
  const last30 = state.donations.filter((d) => isWithinDays(d.createdAt, 30));
  const total30 = last30.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  metricDonations.textContent = fmtCurrency.format(total30);
  const openRequests = state.requests.filter((r) => (r.status || 'open') === 'open').length;
  metricRequests.textContent = String(openRequests);
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

function renderDonorActivity() {
  const recent = [...state.donors]
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .slice(0, 6);
  donorActivityCount.textContent = String(recent.length);
  if (!recent.length) {
    donorActivityList.innerHTML = '<li>No donor activity yet.</li>';
    return;
  }
  donorActivityList.innerHTML = recent
    .map((row) => {
      const name = row.name || 'Unnamed donor';
      const tier = row.tier || 'general';
      const created = renderDate(row.createdAt);
      const source = row.source || 'Direct';
      return `<li><strong>${name}</strong><br><small>${tier} · ${source} · ${created}</small></li>`;
    })
    .join('');
}

function renderProgramActivity() {
  if (!state.projects.length) {
    programActivityList.innerHTML = '<li>No projects logged.</li>';
    return;
  }
  const stages = state.projects.reduce((acc, project) => {
    const stage = project.stage || 'intake';
    acc[stage] = (acc[stage] || 0) + 1;
    return acc;
  }, {});
  programActivityList.innerHTML = Object.entries(stages)
    .map(
      ([stage, count]) => `
      <li><strong>${stage}</strong><br><small>${count} active</small></li>
    `
    )
    .join('');
}

function renderWishlistGauge() {
  const funded = state.wishlist.reduce((sum, row) => sum + Number(row.quantityFunded || 0), 0);
  const needed = state.wishlist.reduce((sum, row) => sum + Number(row.quantityNeeded || 0), 0) || 0;
  const percent = needed ? Math.min(100, Math.round((funded / needed) * 100)) : 0;
  const angle = (percent / 100) * 360;
  if (wishlistGauge) {
    wishlistGauge.style.background = `conic-gradient(#0ea5e9 ${angle}deg, #e2e8f0 ${angle}deg)`;
  }
  metricWishlist.textContent = needed ? `${funded}/${needed}` : '0 / 0';
}

function renderDonationChart() {
  if (!donationsChart) return;
  const rect = donationsChart.getBoundingClientRect();
  donationsChart.width = rect.width || 320;
  donationsChart.height = rect.height || 160;
  const ctx = donationsChart.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, donationsChart.width, donationsChart.height);
  const series = donationSeries(state.donations, 6);
  const maxValue = Math.max(...series.map((s) => s.total), 1);
  const chartWidth = donationsChart.width || donationsChart.getBoundingClientRect().width;
  const chartHeight = donationsChart.height || donationsChart.getBoundingClientRect().height;
  const padding = 24;
  const barWidth = (chartWidth - padding * 2) / series.length - 12;
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, chartWidth, chartHeight);
  series.forEach((point, index) => {
    const x = padding + index * (barWidth + 12);
    const height = (point.total / maxValue) * (chartHeight - padding * 2);
    const y = chartHeight - padding - height;
    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(x, y, barWidth, height);
    ctx.fillStyle = '#0f172a';
    ctx.font = '12px Space Grotesk, sans-serif';
    ctx.fillText(point.label, x, chartHeight - padding + 14);
  });
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
            <small>${row.program || 'General'} · ${row.category || 'general'} · Priority: ${row.priority || 'medium'}</small>
            <small>${row.quantityFunded || 0}/${row.quantityNeeded || '?'} funded (${percent}%)</small>
          </div>
          <div>
            <strong>${price}</strong>
          </div>
          <div class="row-actions">
            <button class="link" data-action="edit-wishlist" data-id="${row.id}">Edit</button>
            <button class="link danger" data-action="delete-wishlist" data-id="${row.id}">Delete</button>
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
          <div class="row-actions">
            <button class="link" data-action="resolve-request" data-id="${row.id}">Mark resolved</button>
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
          <div class="row-actions">
            <button class="link" data-action="edit-donor" data-id="${row.id}">Edit</button>
            <button class="link danger" data-action="delete-donor" data-id="${row.id}">Delete</button>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderDonorTimeline() {
  if (!donorTimeline) return;
  let related = state.messages;
  const selectedDonor = state.selected.donorId
    ? state.donors.find((d) => d.id === state.selected.donorId)
    : null;
  if (selectedDonor?.email) {
    const email = selectedDonor.email.toLowerCase();
    related = related.filter(
      (m) => (m.relatedEmail || '').toLowerCase() === email || (m.segment || '') === selectedDonor.tier
    );
  }
  const list = related.slice(0, 6);
  if (!list.length) {
    donorTimeline.innerHTML = '<li>No contact history yet.</li>';
    return;
  }
  donorTimeline.innerHTML = list
    .map((row) => {
      const subject = row.subject || 'Update';
      const channel = row.channel || 'email';
      const created = renderDate(row.createdAt);
      const who = row.relatedEmail || row.segment || 'All donors';
      return `<li><strong>${subject}</strong><br><small>${channel.toUpperCase()} · ${who} · ${created}</small></li>`;
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
          <div class="row-actions">
            <button class="link" data-action="edit-project" data-id="${row.id}">Edit</button>
            <button class="link danger" data-action="delete-project" data-id="${row.id}">Delete</button>
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
      const tags = Array.isArray(row.tags) ? row.tags.join(', ') : row.tags || '';
      return `
        <div class="row message">
          <div>
            <strong>${subject}</strong>
            <small>${channel.toUpperCase()} · Segment: ${segment}</small>
            <small>Created ${created}</small>
            ${tags ? `<small>Tags: ${tags}</small>` : ''}
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

function isWithinDays(timestamp, days) {
  if (!timestamp) return false;
  const dateVal = typeof timestamp.toDate === 'function' ? timestamp.toDate() : timestamp.seconds ? new Date(timestamp.seconds * 1000) : null;
  if (!dateVal) return false;
  const date = dateVal;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return date.getTime() >= cutoff;
}

function donationSeries(rows, monthsBack) {
  const now = new Date();
  const series = [];
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString('en-US', { month: 'short' });
    const total = rows
      .filter((row) => {
        const tsVal = row.createdAt;
        if (!tsVal) return false;
        const ts = typeof tsVal.toDate === 'function' ? tsVal.toDate() : new Date(tsVal?.seconds * 1000);
        if (!ts || Number.isNaN(ts.getTime?.())) return false;
        return ts && ts.getMonth() === d.getMonth() && ts.getFullYear() === d.getFullYear();
      })
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    series.push({ label, total });
  }
  return series;
}
