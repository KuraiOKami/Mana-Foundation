const { db, FieldValue } = require('./lib/firebase-admin');
const sgMail = require('@sendgrid/mail');
const { success, serverError } = require('./lib/response');

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'hello@manafoundation.org';
const FROM_EMAIL = process.env.FROM_EMAIL || 'orders@manafoundation.org';

// This function can be triggered via:
// 1. Netlify Scheduled Functions (recommended for daily checks)
// 2. Manual HTTP call from admin
// 3. Webhook after successful payment

exports.handler = async (event) => {
  try {
    console.log('Starting order queue processing...');

    // Find wishlist items that are fully funded but not yet ordered
    const itemsToProcess = [];

    // Check items with buyItem donation type
    const buyItemsSnapshot = await db.collection('wishlistItems')
      .where('orderStatus', '==', 'pending')
      .get();

    for (const doc of buyItemsSnapshot.docs) {
      const item = doc.data();

      // Check if fully funded
      let isFullyFunded = false;

      if (item.donationType === 'pool' || item.donationType === 'both') {
        // Pool items: check if poolFunded >= poolGoal
        const poolGoal = item.poolGoal || (item.price * 100 * (item.quantityNeeded || 1));
        isFullyFunded = (item.poolFunded || 0) >= poolGoal;
      } else {
        // Buy items: check if quantityFunded >= quantityNeeded
        isFullyFunded = (item.quantityFunded || 0) >= (item.quantityNeeded || 1);
      }

      if (isFullyFunded) {
        itemsToProcess.push({ id: doc.id, ...item });
      }
    }

    console.log(`Found ${itemsToProcess.length} items to process`);

    if (itemsToProcess.length === 0) {
      return success({ message: 'No items to process', processed: 0 });
    }

    // Process each item
    const results = [];

    for (const item of itemsToProcess) {
      try {
        // Get vendor config for shipping address
        let shippingAddress = null;
        if (item.vendorName) {
          const vendorSnapshot = await db.collection('vendorConfigs')
            .where('vendorName', '==', item.vendorName)
            .limit(1)
            .get();

          if (!vendorSnapshot.empty) {
            const vendorConfig = vendorSnapshot.docs[0].data();
            shippingAddress = vendorConfig.defaultShippingAddress;
          }
        }

        // Calculate total amount
        const totalAmount = item.donationType === 'pool'
          ? item.poolFunded
          : (item.price * 100 * item.quantityFunded);

        // Create order record
        const orderRef = await db.collection('orders').add({
          status: 'processing',
          orderType: 'auto',
          items: [{
            wishlistItemId: item.id,
            title: item.title,
            quantity: item.quantityNeeded || 1,
            unitPrice: item.price * 100,
            totalPrice: totalAmount
          }],
          vendorName: item.vendorName || 'unknown',
          vendorUrl: item.vendorUrl || '',
          shippingAddress: shippingAddress || {
            name: 'Mana Foundation Warehouse',
            address: '245 Citrus Avenue',
            city: 'Orlando',
            state: 'FL',
            zip: '32801'
          },
          totalAmount,
          fundingSource: item.donationType === 'pool' ? 'pool' : 'donations',
          createdAt: FieldValue.serverTimestamp(),
          notes: `Auto-created for fully funded item: ${item.title}`
        });

        // Update wishlist item status
        await db.collection('wishlistItems').doc(item.id).update({
          orderStatus: 'processing',
          orderId: orderRef.id,
          updatedAt: FieldValue.serverTimestamp()
        });

        // Send notification email to admin
        await sendOrderNotification(item, orderRef.id, shippingAddress);

        results.push({
          itemId: item.id,
          orderId: orderRef.id,
          title: item.title,
          status: 'success'
        });

        console.log(`Created order ${orderRef.id} for item ${item.id}: ${item.title}`);

      } catch (itemError) {
        console.error(`Error processing item ${item.id}:`, itemError);
        results.push({
          itemId: item.id,
          title: item.title,
          status: 'error',
          error: itemError.message
        });
      }
    }

    return success({
      message: `Processed ${results.length} items`,
      processed: results.filter(r => r.status === 'success').length,
      errors: results.filter(r => r.status === 'error').length,
      results
    });

  } catch (err) {
    console.error('Order queue processing error:', err);
    return serverError(err.message);
  }
};

async function sendOrderNotification(item, orderId, shippingAddress) {
  const vendorUrl = item.vendorUrl || 'No vendor URL provided';
  const vendorName = item.vendorName || 'Unknown vendor';
  const totalAmount = item.donationType === 'pool'
    ? formatCurrency(item.poolFunded)
    : formatCurrency(item.price * 100 * item.quantityFunded);

  const addressStr = shippingAddress
    ? `${shippingAddress.name}\n${shippingAddress.address}\n${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.zip}`
    : 'No shipping address configured';

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #7367f0, #6366f1); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px; }
    .item-card { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #e2e8f0; }
    .btn { display: inline-block; padding: 12px 24px; background: #7367f0; color: white; text-decoration: none; border-radius: 6px; margin: 10px 5px 10px 0; }
    .details { background: #fff; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .label { color: #64748b; font-size: 12px; text-transform: uppercase; }
    .value { font-size: 16px; font-weight: 600; color: #0f172a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Order Ready for Processing</h1>
      <p>A wishlist item has been fully funded!</p>
    </div>
    <div class="content">
      <div class="item-card">
        <p class="label">Item</p>
        <p class="value">${item.title}</p>
        <p>${item.program || 'General'} - ${item.category || 'general'}</p>
      </div>

      <div class="details">
        <p class="label">Order ID</p>
        <p class="value">${orderId}</p>

        <p class="label">Total Funded</p>
        <p class="value">${totalAmount}</p>

        <p class="label">Quantity</p>
        <p class="value">${item.quantityNeeded || 1}</p>

        <p class="label">Vendor</p>
        <p class="value">${vendorName}</p>

        <p class="label">Product URL</p>
        <p><a href="${vendorUrl}">${vendorUrl}</a></p>
      </div>

      <div class="item-card">
        <p class="label">Ship To</p>
        <pre style="margin: 0; font-family: inherit;">${addressStr}</pre>
      </div>

      <h3>Next Steps:</h3>
      <ol>
        <li>Click the product URL above to visit the vendor</li>
        <li>Place the order and note the confirmation number</li>
        <li>Update the order status in the admin portal</li>
        <li>Add tracking information when available</li>
      </ol>

      <a href="${vendorUrl}" class="btn">Go to Vendor</a>
      <a href="https://manafoundation.org/admin/" class="btn" style="background: #64748b;">Open Admin Portal</a>
    </div>
  </div>
</body>
</html>
  `;

  const msg = {
    to: ADMIN_EMAIL,
    from: {
      email: FROM_EMAIL,
      name: 'Mana Foundation Orders'
    },
    subject: `[Action Required] Order Ready: ${item.title}`,
    html: emailHtml,
    text: `
NEW ORDER READY FOR PROCESSING
==============================

Item: ${item.title}
Program: ${item.program || 'General'}
Order ID: ${orderId}
Total Funded: ${totalAmount}
Quantity: ${item.quantityNeeded || 1}
Vendor: ${vendorName}
Product URL: ${vendorUrl}

Ship To:
${addressStr}

NEXT STEPS:
1. Visit the product URL
2. Place the order
3. Update the order status in admin portal
4. Add tracking when available

Admin Portal: https://manafoundation.org/admin/
    `
  };

  await sgMail.send(msg);
  console.log(`Sent order notification for ${item.title} to ${ADMIN_EMAIL}`);
}

function formatCurrency(cents) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(cents / 100);
}
