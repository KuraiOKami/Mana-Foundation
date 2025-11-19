const REQUIRED_VARS = ['FIREBASE_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_APP_ID'];

const response = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  },
  body: JSON.stringify(body)
});

exports.handler = async () => {
  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
  if (missing.length) {
    return response(500, {
      error: `Missing Firebase env vars: ${missing.join(', ')}`
    });
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;

  const config = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID
  };

  return response(200, config);
};
