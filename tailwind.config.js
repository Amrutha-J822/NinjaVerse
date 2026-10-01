/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {},
    // One pixel font everywhere, to match the pixel-art game
    fontFamily: {
      main_menu: ['"Press Start 2P"', 'monospace'],
      pixel: ['"Press Start 2P"', 'monospace']
    }
  },
  plugins: []
};
