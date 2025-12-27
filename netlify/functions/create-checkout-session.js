const { stripe } = require('./lib/stripe');
const { db, FieldValue } = require('./lib/firebase-admin');
const { success, error, serverError, corsHeaders } = require('./lib/response');

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return error('Method not allowed', 405);
  }

  try {
    const {
      donationType,        // "buyItem" | "poolContribution" | "general"
      wishlistItemId,      // For buyItem/poolContribution
      quantity,            // For buyItem (number of items)
      amount,              // For poolContribution/general (in cents)
      donorEmail,
      donorName,
      eventId,             // Optional: link donation to specific event
      successUrl,
      cancelUrl
    } = JSON.parse(event.body);

    // Validate required fields
    if (!donationType || !donorEmail || !successUrl || !cancelUrl) {
      return error('Missing required fields: donationType, donorEmail, successUrl, cancelUrl');
    }

    let sessionConfig;
    let itemData = null;

    switch (donationType) {
      case 'buyItem': {
        if (!wishlistItemId || !quantity) {
          return error('buyItem requires wishlistItemId and quantity');
        }

        // Fetch the wishlist item
        const itemDoc = await db.collection('wishlistItems').doc(wishlistItemId).get();
        if (!itemDoc.exists) {
          return error('Wishlist item not found', 404);
        }
        itemData = itemDoc.data();

        // Check availability
        const available = (itemData.quantityNeeded || 0) - (itemData.quantityFunded || 0);
        if (quantity > available) {
          return error(`Only ${available} items available for purchase`);
        }

        // Create or get Stripe price
        let priceId = itemData.stripePriceId;
        if (!priceId) {
          // Create Stripe product and price on the fly
          const product = await stripe.products.create({
            name: itemData.title,
            description: `${itemData.program} - ${itemData.category}`,
            metadata: { wishlistItemId }
          });

          const price = await stripe.prices.create({
            product: product.id,
            unit_amount: Math.round(itemData.price * 100), // Convert dollars to cents
            currency: 'usd'
          });

          priceId = price.id;

          // Save back to Firestore
          await db.collection('wishlistItems').doc(wishlistItemId).update({
            stripeProductId: product.id,
            stripePriceId: price.id
          });
        }

        sessionConfig = {
          mode: 'payment',
          line_items: [{
            price: priceId,
            quantity: parseInt(quantity)
          }],
          metadata: {
            donationType: 'buyItem',
            wishlistItemId,
            quantity: String(quantity),
            itemTitle: itemData.title
          }
        };
        break;
      }

      case 'poolContribution': {
        if (!wishlistItemId || !amount) {
          return error('poolContribution requires wishlistItemId and amount');
        }

        // Fetch the wishlist item
        const poolItemDoc = await db.collection('wishlistItems').doc(wishlistItemId).get();
        if (!poolItemDoc.exists) {
          return error('Wishlist item not found', 404);
        }
        itemData = poolItemDoc.data();

        // Check minimum donation
        const minDonation = itemData.minimumPoolDonation || 2500; // Default $25
        if (amount < minDonation) {
          return error(`Minimum pool contribution is $${(minDonation / 100).toFixed(2)}`);
        }

        // Check if pool is already complete
        const poolGoal = itemData.poolGoal || (itemData.price * 100 * (itemData.quantityNeeded || 1));
        const poolFunded = itemData.poolFunded || 0;
        if (poolFunded >= poolGoal) {
          return error('This item has already been fully funded!');
        }

        sessionConfig = {
          mode: 'payment',
          line_items: [{
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Pool Contribution: ${itemData.title}`,
                description: `Contributing toward ${itemData.title} for ${itemData.program}`
              },
              unit_amount: parseInt(amount)
            },
            quantity: 1
          }],
          metadata: {
            donationType: 'poolContribution',
            wishlistItemId,
            amount: String(amount),
            itemTitle: itemData.title
          }
        };
        break;
      }

      case 'general': {
        if (!amount) {
          return error('general donation requires amount');
        }

        if (amount < 100) { // Minimum $1
          return error('Minimum donation is $1.00');
        }

        sessionConfig = {
          mode: 'payment',
          line_items: [{
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'General Donation',
                description: 'Supporting Mana Foundation programs and community outreach'
              },
              unit_amount: parseInt(amount)
            },
            quantity: 1
          }],
          metadata: {
            donationType: 'general',
            eventId: eventId || ''
          }
        };
        break;
      }

      default:
        return error('Invalid donationType. Must be: buyItem, poolContribution, or general');
    }

    // Create the Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      ...sessionConfig,
      customer_email: donorEmail,
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: {
        ...sessionConfig.metadata,
        donorName: donorName || 'Anonymous',
        donorEmail,
        eventId: eventId || ''
      },
      // Allow promotion codes
      allow_promotion_codes: true,
      // Collect billing address for tax receipts
      billing_address_collection: 'required'
    });

    return success({
      sessionId: session.id,
      url: session.url
    });

  } catch (err) {
    console.error('Checkout session error:', err);
    return serverError(err.message);
  }
};
