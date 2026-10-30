// Tailwind CDN theme (loaded after the CDN script, no inline JS needed).
tailwind.config = {
  darkMode: 'class',
  theme: { extend: {
    fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
    colors: {
      ink: { 950: '#07070a', 900: '#0d0d12', 800: '#14141b', 700: '#1c1c26' },
      gold: { 300: '#fcd77a', 400: '#f5b83d', 500: '#e29a14' },
    },
  } },
};
