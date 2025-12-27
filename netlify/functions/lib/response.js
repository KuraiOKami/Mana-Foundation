// Standard HTTP response helper for Netlify Functions

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

const response = (statusCode, body, additionalHeaders = {}) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    ...corsHeaders,
    ...additionalHeaders
  },
  body: JSON.stringify(body)
});

const success = (data) => response(200, data);

const error = (message, statusCode = 400) => response(statusCode, { error: message });

const serverError = (message = 'Internal server error') => response(500, { error: message });

module.exports = { response, success, error, serverError, corsHeaders };
