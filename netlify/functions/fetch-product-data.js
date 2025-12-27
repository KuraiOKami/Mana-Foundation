const { success, error, corsHeaders } = require('./lib/response');

// Vendor URL patterns and product ID extractors
const vendorPatterns = {
  amazon: {
    patterns: [
      /amazon\.com.*\/dp\/([A-Z0-9]{10})/i,
      /amazon\.com.*\/gp\/product\/([A-Z0-9]{10})/i,
      /amzn\.to\/([A-Za-z0-9]+)/i
    ],
    name: 'Amazon',
    getProductUrl: (productId) => `https://www.amazon.com/dp/${productId}`
  },
  lowes: {
    patterns: [
      /lowes\.com.*\/pd\/.*\/(\d+)/i,
      /lowes\.com.*\/(\d{6,})/i
    ],
    name: 'Lowes',
    getProductUrl: (productId) => `https://www.lowes.com/pd/${productId}`
  },
  walmart: {
    patterns: [
      /walmart\.com.*\/ip\/.*\/(\d+)/i,
      /walmart\.com.*\/(\d{6,})/i
    ],
    name: 'Walmart',
    getProductUrl: (productId) => `https://www.walmart.com/ip/${productId}`
  },
  homedepot: {
    patterns: [
      /homedepot\.com.*\/p\/.*\/(\d+)/i,
      /homedepot\.com.*\/(\d{6,})/i
    ],
    name: 'Home Depot',
    getProductUrl: (productId) => `https://www.homedepot.com/p/${productId}`
  }
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return error('Method not allowed', 405);
  }

  try {
    const { url } = JSON.parse(event.body);

    if (!url) {
      return error('URL is required');
    }

    // Try to match against known vendor patterns
    for (const [vendorKey, vendor] of Object.entries(vendorPatterns)) {
      for (const pattern of vendor.patterns) {
        const match = url.match(pattern);
        if (match) {
          const productId = match[1];

          return success({
            vendor: vendorKey,
            vendorDisplayName: vendor.name,
            productId,
            productUrl: vendor.getProductUrl(productId),
            originalUrl: url,

            // Since we can't reliably scrape these sites without API access,
            // we return a flag indicating manual entry is needed
            requiresManualEntry: true,
            message: `Product ID detected from ${vendor.name}. Please enter the product title, price, and image URL manually.`,

            // Placeholder fields for admin to fill
            suggestedFields: {
              title: '',
              price: 0,
              image: ''
            }
          });
        }
      }
    }

    // No vendor matched - treat as generic URL
    return success({
      vendor: 'other',
      vendorDisplayName: 'Other',
      productId: null,
      productUrl: url,
      originalUrl: url,
      requiresManualEntry: true,
      message: 'Vendor not recognized. Please enter all product details manually.',
      suggestedFields: {
        title: '',
        price: 0,
        image: ''
      }
    });

  } catch (err) {
    console.error('Error parsing product URL:', err);
    return error(err.message);
  }
};
