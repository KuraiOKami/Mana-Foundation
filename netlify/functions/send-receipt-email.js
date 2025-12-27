const sgMail = require('@sendgrid/mail');
const { db, FieldValue } = require('./lib/firebase-admin');
const { success, error, serverError, corsHeaders } = require('./lib/response');

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const FROM_EMAIL = process.env.FROM_EMAIL || 'receipts@manafoundation.org';
const FROM_NAME = 'Mana Foundation';

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return error('Method not allowed', 405);
  }

  try {
    const { donationId } = JSON.parse(event.body);

    if (!donationId) {
      return error('donationId is required');
    }

    // Fetch the donation
    const donationDoc = await db.collection('donations').doc(donationId).get();
    if (!donationDoc.exists) {
      return error('Donation not found', 404);
    }

    const donation = donationDoc.data();

    // Skip if already sent
    if (donation.receiptSent) {
      return success({ message: 'Receipt already sent', donationId });
    }

    // Format the email
    const amountFormatted = formatCurrency(donation.amount);
    const date = donation.createdAt?.toDate() || new Date();
    const dateFormatted = date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    let itemDescription = 'General donation to Mana Foundation programs';
    if (donation.donationType === 'buyItem' && donation.wishlistItemTitle) {
      itemDescription = `Purchase of ${donation.quantityPurchased || 1}x ${donation.wishlistItemTitle}`;
    } else if (donation.donationType === 'poolContribution' && donation.wishlistItemTitle) {
      itemDescription = `Pool contribution toward ${donation.wishlistItemTitle}`;
    }

    const emailHtml = generateReceiptHtml({
      donorName: donation.donorName || 'Valued Donor',
      amount: amountFormatted,
      date: dateFormatted,
      description: itemDescription,
      program: donation.program || 'General Fund',
      donationId: donationDoc.id
    });

    const msg = {
      to: donation.email,
      from: {
        email: FROM_EMAIL,
        name: FROM_NAME
      },
      subject: `Thank you for your ${amountFormatted} donation to Mana Foundation`,
      html: emailHtml,
      text: generateReceiptText({
        donorName: donation.donorName || 'Valued Donor',
        amount: amountFormatted,
        date: dateFormatted,
        description: itemDescription,
        program: donation.program || 'General Fund',
        donationId: donationDoc.id
      })
    };

    await sgMail.send(msg);

    // Mark receipt as sent
    await donationDoc.ref.update({
      receiptSent: true,
      receiptSentAt: FieldValue.serverTimestamp()
    });

    return success({ message: 'Receipt sent successfully', donationId });

  } catch (err) {
    console.error('Error sending receipt:', err);
    return serverError(err.message);
  }
};

function formatCurrency(cents) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(cents / 100);
}

function generateReceiptHtml({ donorName, amount, date, description, program, donationId }) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Donation Receipt</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #7367f0; }
    .logo { font-size: 24px; font-weight: bold; color: #7367f0; }
    .content { padding: 30px 0; }
    .amount { font-size: 36px; font-weight: bold; color: #7367f0; text-align: center; margin: 20px 0; }
    .details { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .details p { margin: 8px 0; }
    .details strong { color: #555; }
    .tax-info { background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 14px; }
    .footer { text-align: center; padding: 20px 0; border-top: 1px solid #eee; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">Mana Foundation</div>
    <p>Donation Receipt</p>
  </div>

  <div class="content">
    <p>Dear ${donorName},</p>

    <p>Thank you for your generous donation to Mana Foundation. Your support helps us serve communities in need across Florida.</p>

    <div class="amount">${amount}</div>

    <div class="details">
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>Description:</strong> ${description}</p>
      <p><strong>Program:</strong> ${program}</p>
      <p><strong>Receipt #:</strong> ${donationId}</p>
    </div>

    <div class="tax-info">
      <strong>Tax Deduction Information</strong><br>
      Mana Foundation is a 501(c)(3) nonprofit organization. Your donation is tax-deductible to the extent allowed by law. No goods or services were provided in exchange for this contribution.<br><br>
      <strong>EIN:</strong> XX-XXXXXXX
    </div>

    <p>Your generosity makes a real difference in the lives of those we serve. Thank you for being part of our mission.</p>

    <p>With gratitude,<br>
    The Mana Foundation Team</p>
  </div>

  <div class="footer">
    <p>Mana Foundation | Orlando, FL</p>
    <p>hello@manafoundation.org | (407) 555-1234</p>
    <p><a href="https://manafoundation.org">www.manafoundation.org</a></p>
  </div>
</body>
</html>
  `;
}

function generateReceiptText({ donorName, amount, date, description, program, donationId }) {
  return `
MANA FOUNDATION - DONATION RECEIPT
===================================

Dear ${donorName},

Thank you for your generous donation to Mana Foundation.

DONATION DETAILS
----------------
Amount: ${amount}
Date: ${date}
Description: ${description}
Program: ${program}
Receipt #: ${donationId}

TAX DEDUCTION INFORMATION
-------------------------
Mana Foundation is a 501(c)(3) nonprofit organization. Your donation is tax-deductible to the extent allowed by law. No goods or services were provided in exchange for this contribution.

EIN: XX-XXXXXXX

Thank you for being part of our mission.

With gratitude,
The Mana Foundation Team

---
Mana Foundation | Orlando, FL
hello@manafoundation.org | (407) 555-1234
www.manafoundation.org
  `;
}
