const { db } = require('./lib/firebase-admin');
const { success, serverError, corsHeaders } = require('./lib/response');

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const snapshot = await db.collection('wishlistItems')
      .orderBy('priority', 'desc')
      .orderBy('createdAt', 'desc')
      .get();

    const items = snapshot.docs.map(doc => {
      const data = doc.data();

      // Calculate progress
      let progressPercent = 0;
      let remaining = 0;

      if (data.donationType === 'pool' || data.donationType === 'both') {
        const poolGoal = data.poolGoal || (data.price * 100 * (data.quantityNeeded || 1));
        const poolFunded = data.poolFunded || 0;
        progressPercent = Math.min(100, Math.round((poolFunded / poolGoal) * 100));
        remaining = Math.max(0, poolGoal - poolFunded);
      } else {
        const needed = data.quantityNeeded || 1;
        const funded = data.quantityFunded || 0;
        progressPercent = Math.min(100, Math.round((funded / needed) * 100));
        remaining = Math.max(0, needed - funded);
      }

      const isFullyFunded = progressPercent >= 100;

      // Return only public-safe fields
      return {
        id: doc.id,
        title: data.title,
        program: data.program,
        category: data.category,
        price: data.price,
        priceInCents: Math.round((data.price || 0) * 100),
        image: data.image || '',
        notes: data.notes || '',
        priority: data.priority || 'medium',

        // Donation configuration
        donationType: data.donationType || 'buyItem',
        minimumPoolDonation: data.minimumPoolDonation || 2500,

        // Quantity tracking
        quantityNeeded: data.quantityNeeded || 1,
        quantityFunded: data.quantityFunded || 0,
        quantityAvailable: Math.max(0, (data.quantityNeeded || 1) - (data.quantityFunded || 0)),

        // Pool tracking
        poolGoal: data.poolGoal || (data.price * 100 * (data.quantityNeeded || 1)),
        poolFunded: data.poolFunded || 0,
        poolDonorCount: data.poolDonorCount || 0,
        poolRemaining: remaining,

        // Computed
        progressPercent,
        isFullyFunded,

        // Vendor info (for display)
        vendorName: data.vendorName || null
      };
    });

    // Filter out fully funded items unless they're recent (within 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const activeItems = items.filter(item =>
      !item.isFullyFunded ||
      (item.poolCompletedAt && item.poolCompletedAt.toDate() > sevenDaysAgo)
    );

    return success({
      items: activeItems,
      total: activeItems.length
    });

  } catch (err) {
    console.error('Error fetching wishlist:', err);
    return serverError(err.message);
  }
};
