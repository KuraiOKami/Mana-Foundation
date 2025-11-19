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
  limit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const root = document.querySelector('main');
const loginErrorEl = document.getElementById('login-error');
const dataErrorEl = document.getElementById('data-error');
const loginSection = document.querySelector('[data-view="login"]');
const dashboardSection = document.querySelector('[data-view="dashboard"]');
const userPanel = document.querySelector('.user-panel');
const refreshBtn = document.getElementById('refresh');
const signOutBtn = document.getElementById('sign-out');
const userEmailEl = document.getElementById('user-email');

const metricDonations = document.getElementById('metric-donations');
const metricWishlist = document.getElementById('metric-wishlist');
const metricRequests = document.getElementById('metric-requests');

const donationsList = document.getElementById('donations-list');
const donationsCount = document.getElementById('donations-count');
const wishlistList = document.getElementById('wishlist-list');
const wishlistCount = document.getElementById('wishlist-count');
const requestsList = document.getElementById('requests-list');
const requestsCount = document.getElementById('requests-count');

const crmProspectsList = document.getElementById('crm-prospects');
const crmNurturingList = document.getElementById('crm-nurturing');
const crmChampionsList = document.getElementById('crm-champions');
const crmProspectsCount = document.getElementById('crm-prospects-count');
const crmNurturingCount = document.getElementById('crm-nurturing-count');
const crmChampionsCount = document.getElementById('crm-champions-count');
const crmCasesList = document.getElementById('crm-cases');
const crmCasesCount = document.getElementById('crm-cases-count');
const crmTasksList = document.getElementById('crm-tasks');
const crmTasksCount = document.getElementById('crm-tasks-count');

const CRM_STAGE_CONFIG = {
  prospect: {
    list: crmProspectsList,
    count: crmProspectsCount,
    empty: 'No prospects logged. Add your next warm lead.'
  },
  nurturing: {
    list: crmNurturingList,
    count: crmNurturingCount,
    empty: 'Nothing in progress. Follow up with a donor to populate this column.'
  },
  champion: {
    list: crmChampionsList,
    count: crmChampionsCount,
    empty: 'No champions tracked yet. Celebrate recurring donors here.'
  }
};

const fmtCurrency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmtDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

let config;
try {
  const promise = window.firebaseConfigPromise || Promise.resolve(window.firebaseConfig);
  config = await promise;
} catch (error) {
  loginSection.innerHTML =
    '<p class="error">Unable to load Firebase configuration. Check Netlify serverless logs.</p>';
  throw error;
}

if (!config || !config.apiKey) {
  loginSection.innerHTML = '<p class="error">Missing Firebase configuration. Update Netlify env vars.</p>';
  throw new Error('Missing Firebase configuration');
}

const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence).catch(() => {});

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

onAuthStateChanged(auth, (user) => {
  if (user) {
    root.dataset.state = 'authenticated';
    userPanel.dataset.auth = 'signed-in';
    userEmailEl.textContent = user.email ?? 'Admin';
    refreshData();
  } else {
    root.dataset.state = 'signed-out';
    userPanel.dataset.auth = 'signed-out';
    userEmailEl.textContent = '—';
    clearLists();
  }
});

function clearLists() {
  metricDonations.textContent = '—';
  metricWishlist.textContent = '—';
  metricRequests.textContent = '—';
  donationsList.innerHTML = '';
  donationsCount.textContent = '0';
  wishlistList.innerHTML = '';
  wishlistCount.textContent = '0';
  requestsList.innerHTML = '';
  requestsCount.textContent = '0';
  crmProspectsList.innerHTML = '';
  crmNurturingList.innerHTML = '';
  crmChampionsList.innerHTML = '';
  crmProspectsCount.textContent = '0';
  crmNurturingCount.textContent = '0';
  crmChampionsCount.textContent = '0';
  crmCasesList.innerHTML = '';
  crmCasesCount.textContent = '0';
  crmTasksList.innerHTML = '';
  crmTasksCount.textContent = '0';
}

async function refreshData() {
  if (!auth.currentUser) return;
  setLoading(true);
  dataErrorEl.textContent = '';
  try {
    const [donations, wishlist, requests] = await Promise.all([
      fetchCollection('donations', { orderByField: 'createdAt', orderDirection: 'desc', limitTo: 6 }),
      fetchCollection('wishlistItems', { orderByField: 'title' }),
      fetchCollection('supportRequests', { orderByField: 'createdAt', orderDirection: 'desc', limitTo: 6 })
    ]);
    renderDonations(donations);
    renderWishlist(wishlist);
    renderRequests(requests);
    renderCRM({ donations, wishlist, requests });
  } catch (error) {
    console.error(error);
    dataErrorEl.textContent = 'Unable to load data. Check Firestore rules or network connection.';
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

function renderDonations(rows) {
  donationsCount.textContent = String(rows.length);
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  metricDonations.textContent = fmtCurrency.format(total);
  donationsList.innerHTML = rows
    .map((row) => {
      const donor = row.donorName || row.email || 'Anonymous';
      const amount = fmtCurrency.format(row.amount || 0);
      const date = row.createdAt?.toDate ? fmtDate.format(row.createdAt.toDate()) : '—';
      const program = row.program || row.programName || 'General';
      return `<li><strong>${donor}</strong> pledged <strong>${amount}</strong><br><small>${program} · ${date}</small></li>`;
    })
    .join('') || '<li>No donations yet.</li>';
}

function renderWishlist(rows) {
  wishlistCount.textContent = String(rows.length);
  if (!rows.length) {
    wishlistList.innerHTML = '<li>No wish list items found.</li>';
    metricWishlist.textContent = '0 / 0';
    return;
  }
  const funded = rows.reduce((sum, row) => sum + Number(row.quantityFunded || 0), 0);
  const needed = rows.reduce((sum, row) => sum + Number(row.quantityNeeded || 0), 0);
  metricWishlist.textContent = `${funded} / ${needed || '?'} items`;
  wishlistList.innerHTML = rows
    .map((row) => {
      const percent = needed ? Math.round(((row.quantityFunded || 0) / Math.max(row.quantityNeeded || 1, 1)) * 100) : 0;
      return `<li><strong>${row.title || row.name}</strong><br><small>${row.quantityFunded || 0} of ${row.quantityNeeded || '?'} funded · ${percent}%</small></li>`;
    })
    .join('');
}

function renderRequests(rows) {
  requestsCount.textContent = String(rows.length);
  metricRequests.textContent = rows.filter((row) => (row.status || 'open') === 'open').length;
  requestsList.innerHTML = rows.length
    ? rows
        .map((row) => {
          const requester = row.name || 'Neighbor';
          const need = row.need || row.summary || 'No details';
          const date = row.createdAt?.toDate ? fmtDate.format(row.createdAt.toDate()) : '—';
          const status = row.status || 'open';
          return `<li><strong>${requester}</strong> · ${status}<br><small>${need}<br>${date}</small></li>`;
        })
        .join('')
    : '<li>No support requests logged.</li>';
}

function renderCRM(payload) {
  renderCRMBoard(payload.donations || []);
  renderCRMCases(payload.requests || []);
  renderCRMTasks(payload.wishlist || []);
}

function renderCRMBoard(rows) {
  const stageBuckets = {
    prospect: [],
    nurturing: [],
    champion: []
  };
  rows.forEach((row) => {
    const stage = getStageForDonation(row);
    stageBuckets[stage].push(row);
  });

  Object.entries(stageBuckets).forEach(([stage, bucket]) => {
    const { list, count, empty } = CRM_STAGE_CONFIG[stage];
    count.textContent = String(bucket.length);
    list.innerHTML = bucket.length
      ? bucket
          .map((row) => {
            const donor = row.donorName || row.organization || row.email || 'Anonymous';
            const focus = row.program || row.programName || row.note || 'General support';
            const amount = row.amount ? fmtCurrency.format(Number(row.amount)) : '—';
            const date = row.createdAt?.toDate ? fmtDate.format(row.createdAt.toDate()) : 'No gifts logged';
            return `<li><strong>${donor}</strong><small>${focus}</small><small>Last gift: ${amount} · ${date}</small></li>`;
          })
          .join('')
      : `<li>${empty}</li>`;
  });
}

function renderCRMCases(rows) {
  if (!rows.length) {
    crmCasesCount.textContent = '0';
    crmCasesList.innerHTML = '<li>No support cases yet.</li>';
    return;
  }
  const openCases = rows.filter((row) => (row.status || 'open').toLowerCase() !== 'closed');
  crmCasesCount.textContent = String(openCases.length);
  const items = (openCases.length ? openCases : rows).slice(0, 6);
  crmCasesList.innerHTML = items
    .map((row) => {
      const requester = row.name || row.familyName || 'Neighbor';
      const status = (row.status || 'open').replace(/\b\w/g, (char) => char.toUpperCase());
      const city = row.city || row.county || '';
      const summary = row.need || row.summary || 'No description yet.';
      const date = row.createdAt?.toDate ? fmtDate.format(row.createdAt.toDate()) : '—';
      const location = city ? ` · ${city}` : '';
      return `<li><strong>${requester}${location}</strong><small>${summary}</small><small>Status: ${status} · ${date}</small></li>`;
    })
    .join('');
}

function renderCRMTasks(rows) {
  if (!rows.length) {
    crmTasksCount.textContent = '0';
    crmTasksList.innerHTML = '<li>No wish list items to fulfill.</li>';
    return;
  }
  const tasks = rows
    .map((row) => {
      const needed = Number(row.quantityNeeded || 0);
      const funded = Number(row.quantityFunded || 0);
      return {
        title: row.title || row.name || 'Wish list item',
        owner: row.owner || row.contact || 'Sourcing team',
        remaining: Math.max(needed - funded, 0),
        needed,
        funded
      };
    })
    .filter((row) => row.needed === 0 || row.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining)
    .slice(0, 6);

  crmTasksCount.textContent = String(tasks.length);
  crmTasksList.innerHTML =
    tasks.length > 0
      ? tasks
          .map((task) => {
            const remainingLabel =
              task.needed === 0 ? 'Need qty not set' : `${task.remaining} of ${task.needed} remaining`;
            return `<li><strong>${task.title}</strong><small>${remainingLabel}</small><small>Owner: ${task.owner}</small></li>`;
          })
          .join('')
      : '<li>All wish list items are fully funded!</li>';
}

function getStageForDonation(row) {
  const rawStage = String(row.stage || row.relationshipStage || row.tier || '').toLowerCase();
  if (rawStage.includes('champ') || rawStage.includes('major') || rawStage.includes('partner')) return 'champion';
  if (rawStage.includes('nurtur') || rawStage.includes('cultivate') || rawStage.includes('engag')) return 'nurturing';
  if (rawStage.includes('prospect') || rawStage.includes('lead')) return 'prospect';

  const amount = Number(row.amount || 0);
  if (amount >= 2500) return 'champion';
  if (amount > 0) return 'nurturing';
  return 'prospect';
}

function setLoading(isLoading) {
  refreshBtn.disabled = isLoading;
  refreshBtn.textContent = isLoading ? 'Refreshing…' : 'Refresh data';
}
