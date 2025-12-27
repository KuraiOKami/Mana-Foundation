// Mana Foundation Donation System
// Public-facing JavaScript for Stripe integration and wishlist rendering

// Stripe publishable key - replace with your actual key
const STRIPE_PUBLISHABLE_KEY = 'pk_test_YOUR_STRIPE_PUBLISHABLE_KEY';

let stripe = null;
let wishlistItems = [];

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initializeStripe();
  loadWishlistItems();
  setupDonationModals();
  setupGeneralDonation();
});

function initializeStripe() {
  if (typeof Stripe !== 'undefined') {
    stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
  } else {
    console.warn('Stripe.js not loaded');
  }
}

// ============================================
// WISHLIST LOADING
// ============================================

async function loadWishlistItems() {
  const grid = document.getElementById('wishlist-grid');
  if (!grid) return;

  try {
    grid.innerHTML = '<p class="loading">Loading items...</p>';

    const response = await fetch('/.netlify/functions/get-public-wishlist');
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      wishlistItems = data.items;
      renderWishlistCards(data.items);
    } else {
      grid.innerHTML = '<p class="placeholder">No items available at this time.</p>';
    }
  } catch (error) {
    console.error('Failed to load wishlist:', error);
    grid.innerHTML = '<p class="error">Unable to load items. Please try again later.</p>';
  }
}

function renderWishlistCards(items) {
  const grid = document.getElementById('wishlist-grid');
  if (!grid) return;

  grid.innerHTML = items.map(item => {
    const isFullyFunded = item.isFullyFunded;
    const showBuyButton = (item.donationType === 'buyItem' || item.donationType === 'both') && !isFullyFunded;
    const showPoolButton = (item.donationType === 'pool' || item.donationType === 'both') && !isFullyFunded;

    return `
      <article class="wishlist-card" data-item-id="${item.id}">
        ${item.image ? `<img src="${item.image}" alt="${item.title}" loading="lazy" />` : ''}
        <div class="content">
          <p class="badge">${item.program}</p>
          <h3>${item.title}</h3>
          ${item.notes ? `<p>${item.notes}</p>` : ''}
          <p class="price">${formatCurrency(item.priceInCents)}</p>

          ${(item.donationType === 'pool' || item.donationType === 'both') ? `
            <div class="progress-tracker">
              <header>
                <span>${formatCurrency(item.poolFunded)} raised</span>
                <span>${formatCurrency(item.poolGoal)} goal</span>
              </header>
              <div class="progress">
                <div class="progress-bar" style="width: ${item.progressPercent}%"></div>
              </div>
              <p class="progress-meta">${item.poolDonorCount} contributor${item.poolDonorCount !== 1 ? 's' : ''}</p>
            </div>
          ` : `
            <small class="quantity-info">${item.quantityFunded} of ${item.quantityNeeded} funded</small>
          `}
        </div>

        <footer>
          ${isFullyFunded ? `
            <span class="badge funded">Fully Funded!</span>
          ` : `
            <div class="donation-actions">
              ${showBuyButton ? `
                <button class="btn"
                        data-action="buy-item"
                        data-item-id="${item.id}"
                        data-price="${item.priceInCents}"
                        data-title="${item.title}"
                        data-available="${item.quantityAvailable}">
                  Buy This Item
                </button>
              ` : ''}

              ${showPoolButton ? `
                <button class="btn ${showBuyButton ? 'ghost' : ''}"
                        data-action="contribute-pool"
                        data-item-id="${item.id}"
                        data-min-amount="${item.minimumPoolDonation}"
                        data-remaining="${item.poolRemaining}"
                        data-title="${item.title}">
                  ${showBuyButton ? 'Contribute Any Amount' : 'Contribute to Pool'}
                </button>
              ` : ''}
            </div>
          `}
          <small>Secure payment via Stripe</small>
        </footer>
      </article>
    `;
  }).join('');

  // Attach event listeners
  attachDonationHandlers();
}

function attachDonationHandlers() {
  document.querySelectorAll('[data-action="buy-item"]').forEach(btn => {
    btn.addEventListener('click', handleBuyItem);
  });

  document.querySelectorAll('[data-action="contribute-pool"]').forEach(btn => {
    btn.addEventListener('click', handlePoolContribution);
  });
}

// ============================================
// DONATION HANDLERS
// ============================================

async function handleBuyItem(event) {
  const btn = event.currentTarget;
  const itemId = btn.dataset.itemId;
  const price = parseInt(btn.dataset.price);
  const title = btn.dataset.title;
  const available = parseInt(btn.dataset.available) || 1;

  // Show quantity modal
  showModal('quantity-modal', {
    title: `Buy: ${title}`,
    price: formatCurrency(price),
    maxQuantity: available,
    onConfirm: async (quantity, donorInfo) => {
      await createCheckoutSession({
        donationType: 'buyItem',
        wishlistItemId: itemId,
        quantity,
        donorEmail: donorInfo.email,
        donorName: donorInfo.name
      });
    }
  });
}

async function handlePoolContribution(event) {
  const btn = event.currentTarget;
  const itemId = btn.dataset.itemId;
  const minAmount = parseInt(btn.dataset.minAmount) || 2500;
  const remaining = parseInt(btn.dataset.remaining);
  const title = btn.dataset.title;

  // Show amount modal
  showModal('amount-modal', {
    title: `Contribute to: ${title}`,
    minAmount: minAmount,
    remaining: remaining,
    onConfirm: async (amount, donorInfo) => {
      await createCheckoutSession({
        donationType: 'poolContribution',
        wishlistItemId: itemId,
        amount,
        donorEmail: donorInfo.email,
        donorName: donorInfo.name
      });
    }
  });
}

function setupGeneralDonation() {
  const generalDonateBtn = document.getElementById('general-donate-btn');
  if (generalDonateBtn) {
    generalDonateBtn.addEventListener('click', () => {
      showModal('amount-modal', {
        title: 'General Donation',
        minAmount: 100, // $1 minimum
        onConfirm: async (amount, donorInfo) => {
          await createCheckoutSession({
            donationType: 'general',
            amount,
            donorEmail: donorInfo.email,
            donorName: donorInfo.name
          });
        }
      });
    });
  }
}

// ============================================
// STRIPE CHECKOUT
// ============================================

async function createCheckoutSession(params) {
  try {
    showLoading(true);

    const response = await fetch('/.netlify/functions/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params,
        successUrl: `${window.location.origin}/donation-success.html`,
        cancelUrl: window.location.href
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    if (data.url) {
      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } else if (data.sessionId && stripe) {
      // Use Stripe.js to redirect
      const { error } = await stripe.redirectToCheckout({ sessionId: data.sessionId });
      if (error) throw error;
    } else {
      throw new Error('Unable to create checkout session');
    }
  } catch (error) {
    console.error('Checkout error:', error);
    alert(`Unable to process donation: ${error.message}`);
    showLoading(false);
  }
}

// ============================================
// MODALS
// ============================================

function setupDonationModals() {
  // Create modal container if it doesn't exist
  if (!document.getElementById('modal-container')) {
    const modalContainer = document.createElement('div');
    modalContainer.id = 'modal-container';
    modalContainer.innerHTML = `
      <div class="modal-overlay" id="modal-overlay"></div>

      <div class="modal" id="quantity-modal">
        <h3 id="quantity-modal-title">Buy Item</h3>
        <p id="quantity-modal-price"></p>
        <label>
          Quantity
          <input type="number" id="quantity-input" min="1" value="1" />
        </label>
        <p class="total">Total: <span id="quantity-total"></span></p>
        <div class="donor-fields">
          <label>
            Your Name
            <input type="text" id="donor-name-qty" placeholder="Your name (or Anonymous)" />
          </label>
          <label>
            Email (for receipt)
            <input type="email" id="donor-email-qty" placeholder="your@email.com" required />
          </label>
        </div>
        <div class="modal-actions">
          <button class="btn ghost" onclick="closeModal()">Cancel</button>
          <button class="btn" id="quantity-confirm-btn">Continue to Payment</button>
        </div>
      </div>

      <div class="modal" id="amount-modal">
        <h3 id="amount-modal-title">Donate</h3>
        <p id="amount-modal-info"></p>
        <label>
          Amount ($)
          <input type="number" id="amount-input" min="1" step="1" value="25" />
        </label>
        <div class="quick-amounts">
          <button class="btn ghost small" data-amount="25">$25</button>
          <button class="btn ghost small" data-amount="50">$50</button>
          <button class="btn ghost small" data-amount="100">$100</button>
          <button class="btn ghost small" data-amount="250">$250</button>
        </div>
        <div class="donor-fields">
          <label>
            Your Name
            <input type="text" id="donor-name-amt" placeholder="Your name (or Anonymous)" />
          </label>
          <label>
            Email (for receipt)
            <input type="email" id="donor-email-amt" placeholder="your@email.com" required />
          </label>
        </div>
        <div class="modal-actions">
          <button class="btn ghost" onclick="closeModal()">Cancel</button>
          <button class="btn" id="amount-confirm-btn">Continue to Payment</button>
        </div>
      </div>
    `;
    document.body.appendChild(modalContainer);

    // Setup quick amount buttons
    document.querySelectorAll('[data-amount]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('amount-input').value = btn.dataset.amount;
      });
    });

    // Close on overlay click
    document.getElementById('modal-overlay').addEventListener('click', closeModal);
  }
}

let currentModalCallback = null;
let currentModalData = null;

function showModal(modalId, options) {
  const modal = document.getElementById(modalId);
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;

  currentModalData = options;
  currentModalCallback = options.onConfirm;

  if (modalId === 'quantity-modal') {
    document.getElementById('quantity-modal-title').textContent = options.title;
    document.getElementById('quantity-modal-price').textContent = `${options.price} each`;
    const qtyInput = document.getElementById('quantity-input');
    qtyInput.max = options.maxQuantity;
    qtyInput.value = 1;
    updateQuantityTotal();

    qtyInput.addEventListener('input', updateQuantityTotal);

    document.getElementById('quantity-confirm-btn').onclick = () => {
      const quantity = parseInt(qtyInput.value) || 1;
      const email = document.getElementById('donor-email-qty').value;
      const name = document.getElementById('donor-name-qty').value || 'Anonymous';

      if (!email) {
        alert('Please enter your email address for the receipt.');
        return;
      }

      closeModal();
      if (currentModalCallback) {
        currentModalCallback(quantity, { email, name });
      }
    };
  }

  if (modalId === 'amount-modal') {
    document.getElementById('amount-modal-title').textContent = options.title;
    const info = options.remaining
      ? `${formatCurrency(options.remaining)} remaining to fully fund this item. Minimum: ${formatCurrency(options.minAmount)}`
      : `Minimum donation: ${formatCurrency(options.minAmount)}`;
    document.getElementById('amount-modal-info').textContent = info;

    const amtInput = document.getElementById('amount-input');
    amtInput.min = (options.minAmount / 100);
    amtInput.value = Math.max(25, options.minAmount / 100);

    document.getElementById('amount-confirm-btn').onclick = () => {
      const amountDollars = parseFloat(amtInput.value) || 0;
      const amountCents = Math.round(amountDollars * 100);
      const email = document.getElementById('donor-email-amt').value;
      const name = document.getElementById('donor-name-amt').value || 'Anonymous';

      if (!email) {
        alert('Please enter your email address for the receipt.');
        return;
      }

      if (amountCents < options.minAmount) {
        alert(`Minimum donation is ${formatCurrency(options.minAmount)}`);
        return;
      }

      closeModal();
      if (currentModalCallback) {
        currentModalCallback(amountCents, { email, name });
      }
    };
  }

  overlay.classList.add('active');
  modal.classList.add('active');
}

function updateQuantityTotal() {
  const qty = parseInt(document.getElementById('quantity-input').value) || 1;
  const item = wishlistItems.find(i => i.id === currentModalData?.itemId);
  if (item) {
    const total = qty * item.priceInCents;
    document.getElementById('quantity-total').textContent = formatCurrency(total);
  }
}

function closeModal() {
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
  document.getElementById('modal-overlay')?.classList.remove('active');
  currentModalCallback = null;
  currentModalData = null;
}

// ============================================
// UTILITIES
// ============================================

function formatCurrency(cents) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(cents / 100);
}

function showLoading(show) {
  let loader = document.getElementById('loading-overlay');
  if (!loader && show) {
    loader = document.createElement('div');
    loader.id = 'loading-overlay';
    loader.innerHTML = '<div class="spinner"></div><p>Processing...</p>';
    document.body.appendChild(loader);
  }
  if (loader) {
    loader.style.display = show ? 'flex' : 'none';
  }
}

// Make closeModal available globally for onclick handlers
window.closeModal = closeModal;
