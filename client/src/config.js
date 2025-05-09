const config = {
    API_URL: process.env.NODE_ENV === 'production'
        ? 'https://onlyfacts-api.onrender.com'  // Production backend URL on Render.com
        : 'http://localhost:5000'  // Development URL
};

export default config;
