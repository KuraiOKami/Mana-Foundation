const { stripe } = require('./lib/stripe');
const { db, FieldValue } = require('./lib/firebase-admin');

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const sig = event.headers['stripe-signature'];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      endpointSecret
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // Handle the event
  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(stripeEvent.data.object);
        break;

      case 'checkout.session.expired':
        // Optional: Log expired sessions
        console.log('Checkout session expired:', stripeEvent.data.object.id);
        break;

      case 'payment_intent.payment_failed':
        // Optional: Handle failed payments
        console.log('Payment failed:', stripeEvent.data.object.id);
        break;

      default:
        console.log(`Unhandled event type: ${stripeEvent.type}`);
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.error('Webhook handler error:', err);
    return { statusCode: 500, body: `Handler Error: ${err.message}` };
  }
};

async function handleCheckoutCompleted(session) {
  const {
    donationType,
    wishlistItemId,
    quantity,
    amount,
    itemTitle,
    donorName,
    donorEmail,
    eventId
  } = session.metadata;

  const amountTotal = session.amount_total; // Total in cents

  // Start Firestore transaction for atomic updates
  await db.runTransaction(async (transaction) => {
    // 1. Create donation record
    const donationRef = db.collection('donations').doc();
    const donationData = {
      donationType,
      donorName: donorName || 'Anonymous',
      email: donorEmail,
      amount: amountTotal,
      source: 'stripe',
      program: 'General',
      stripeSessionId: session.id,
      stripePaymentIntentId: session.payment_intent,
      stripeCustomerId: session.customer || null,
      paymentStatus: 'succeeded',
      wishlistItemId: wishlistItemId || null,
      wishlistItemTitle: itemTitle || null,
      eventId: eventId || null,
      receiptSent: false,
      createdAt: FieldValue.serverTimestamp()
    };

    // 2. Handle based on donation type
    if (donationType === 'buyItem' && wishlistItemId) {
      const itemRef = db.collection('wishlistItems').doc(wishlistItemId);
      const itemDoc = await transaction.get(itemRef);

      if (!itemDoc.exists) {
        throw new Error(`Wishlist item ${wishlistItemId} not found`);
      }

      const item = itemDoc.data();
      const qty = parseInt(quantity) || 1;
      const newQuantityFunded = (item.quantityFunded || 0) + qty;

      donationData.quantityPurchased = qty;
      donationData.program = item.program || 'General';

      transaction.update(itemRef, {
        quantityFunded: newQuantityFunded,
        updatedAt: FieldValue.serverTimestamp()
      });

      // Check if fully funded - trigger order
      if (newQuantityFunded >= (item.quantityNeeded || 1)) {
        transaction.update(itemRef, {
          orderStatus: 'pending'
        });
        // Order processing will be handled by scheduled function
      }
    }

    if (donationType === 'poolContribution' && wishlistItemId) {
      const itemRef = db.collection('wishlistItems').doc(wishlistItemId);
      const itemDoc = await transaction.get(itemRef);

      if (!itemDoc.exists) {
        throw new Error(`Wishlist item ${wishlistItemId} not found`);
      }

      const item = itemDoc.data();
      const newPoolFunded = (item.poolFunded || 0) + amountTotal;
      const newDonorCount = (item.poolDonorCount || 0) + 1;
      const poolGoal = item.poolGoal || (item.price * 100 * (item.quantityNeeded || 1));

      donationData.program = item.program || 'General';

      const updateData = {
        poolFunded: newPoolFunded,
        poolDonorCount: newDonorCount,
        updatedAt: FieldValue.serverTimestamp()
      };

      // Check if pool goal is now met
      if (newPoolFunded >= poolGoal && !(item.poolFunded >= poolGoal)) {
        updateData.poolCompletedAt = FieldValue.serverTimestamp();
        updateData.orderStatus = 'pending';
        updateData.quantityFunded = item.quantityNeeded || 1;

        // Handle overfunding
        if (newPoolFunded > poolGoal) {
          const excess = newPoolFunded - poolGoal;
          console.log(`Pool overfunded by ${excess} cents for item ${wishlistItemId}`);
          // Log overfunding for admin review
          await db.collection('overfunding').add({
            wishlistItemId,
            itemTitle: item.title,
            excessAmount: excess,
            createdAt: FieldValue.serverTimestamp()
          });
        }
      }

      transaction.update(itemRef, updateData);
    }

    if (donationType === 'general' && eventId) {
      // Update event fundraising if linked to event
      const eventRef = db.collection('events').doc(eventId);
      const eventDoc = await transaction.get(eventRef);

      if (eventDoc.exists) {
        const event = eventDoc.data();
        transaction.update(eventRef, {
          fundraisingRaised: (event.fundraisingRaised || 0) + amountTotal,
          updatedAt: FieldValue.serverTimestamp()
        });
        donationData.program = event.programId || 'General';
      }
    }

    // Save the donation record
    transaction.set(donationRef, donationData);

    // 3. Update or create donor record
    await updateDonorRecord(donorEmail, donorName, amountTotal, donationType);
  });

  // 4. Trigger receipt email (async, don't block)
  try {
    await sendReceiptEmail(session, donationType, itemTitle);
  } catch (err) {
    console.error('Failed to send receipt email:', err);
    // Don't throw - receipt failure shouldn't fail the webhook
  }

  console.log(`Successfully processed ${donationType} donation: ${session.id}`);
}

async function updateDonorRecord(email, name, amount, donationType) {
  if (!email) return;

  const donorsRef = db.collection('donors');
  const snapshot = await donorsRef.where('email', '==', email).limit(1).get();

  if (snapshot.empty) {
    // Create new donor
    await donorsRef.add({
      name: name || 'Anonymous',
      email,
      tier: donationType === 'buyItem' ? 'major' : 'general',
      source: 'stripe',
      contactPreference: 'email',
      tags: [donationType],
      notes: '',
      lastContacted: null,
      totalDonated: amount,
      donationCount: 1,
      createdAt: FieldValue.serverTimestamp()
    });
  } else {
    // Update existing donor
    const donorDoc = snapshot.docs[0];
    const donor = donorDoc.data();
    await donorDoc.ref.update({
      totalDonated: (donor.totalDonated || 0) + amount,
      donationCount: (donor.donationCount || 0) + 1,
      lastContacted: FieldValue.serverTimestamp()
    });
  }
}

async function sendReceiptEmail(session, donationType, itemTitle) {
  // This will be implemented in send-receipt-email.js
  // For now, just log that we would send an email
  console.log(`Would send receipt email to ${session.customer_email} for ${donationType}`);

  // Mark receipt as pending (will be sent by separate function)
  // The send-receipt-email function can be triggered separately
}
