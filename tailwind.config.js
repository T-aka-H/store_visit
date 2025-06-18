// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      "./src/**/*.{js,jsx,ts,tsx}",
      "./public/index.html"
    ],
    theme: {
      extend: {
        colors: {
          slate: {
            850: '#1e293b',
            950: '#0f172a'
          }
        },
        animation: {
          'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          'bounce-slow': 'bounce 2s infinite'
        },
        backdropBlur: {
          xs: '2px'
        },
        fontFamily: {
          sans: ['Inter', 'ui-sans-serif', 'system-ui']
        }
      },
    },
    plugins: [
      require('@tailwindcss/forms')({
        strategy: 'class'
      })
    ],
  }