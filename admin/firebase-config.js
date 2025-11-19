(function () {
  const INLINE_CONFIG_ID = 'firebase-config-json';
  const CONFIG_ENDPOINT = '/.netlify/functions/firebase-config';

  const readInlineConfig = () => {
    const node = document.getElementById(INLINE_CONFIG_ID);
    if (!node) return null;
    try {
      return JSON.parse(node.textContent || '{}');
    } catch (error) {
      console.error('Unable to parse inline Firebase config', error);
      return null;
    }
  };

  const loadConfig = async () => {
    if (window.firebaseConfig && window.firebaseConfig.apiKey) return window.firebaseConfig;
    const inlineConfig = readInlineConfig();
    if (inlineConfig && inlineConfig.apiKey) return inlineConfig;

    const response = await fetch(CONFIG_ENDPOINT, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Config request failed with ${response.status}`);
    }
    return response.json();
  };

  const promise = loadConfig()
    .then((config) => {
      window.firebaseConfig = config;
      return config;
    })
    .catch((error) => {
      console.error('Failed to load Firebase config', error);
      const errorEl = document.getElementById('login-error');
      if (errorEl) {
        errorEl.textContent =
          'Unable to load Firebase configuration. Contact the site owner to verify Netlify env vars.';
      }
      throw error;
    });

  window.firebaseConfigPromise = promise;
})();
