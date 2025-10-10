const path = require('path');

module.exports = {
  style: {
    postcss: {
      plugins: [
        require('tailwindcss'),
        require('autoprefixer'),
      ],
    },
  },
  jest: {
    configure: {
      transformIgnorePatterns: [
        '/node_modules/(?!react-markdown|remark-gfm|react-syntax-highlighter|recharts)/',
      ],
    },
  },
};