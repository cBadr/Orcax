import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#e7ecf5',
          100: '#c3cee2',
          200: '#93a5c7',
          300: '#637dac',
          400: '#3f5c95',
          500: '#1f3e7d',
          600: '#15306a',
          700: '#0f2757',
          800: '#0b1e3f',
          900: '#06132b',
          950: '#030a1a',
        },
        gold: {
          50: '#fdf8e6',
          100: '#faefc3',
          200: '#f5e18c',
          300: '#eecf54',
          400: '#e3bb30',
          500: '#d4af37',
          600: '#ae8a24',
          700: '#86691b',
          800: '#5c4912',
          900: '#332809',
        },
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 40px -10px rgba(212, 175, 55, 0.35)',
        navy: '0 10px 30px -12px rgba(3, 10, 26, 0.8)',
      },
      backgroundImage: {
        'hero-radial':
          'radial-gradient(circle at top, rgba(212,175,55,0.12), transparent 60%), linear-gradient(180deg, #06132b 0%, #030a1a 100%)',
        'gold-gradient': 'linear-gradient(135deg, #e3bb30 0%, #d4af37 50%, #ae8a24 100%)',
      },
      keyframes: {
        'pulse-gold': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(212,175,55,0.5)' },
          '50%': { boxShadow: '0 0 0 14px rgba(212,175,55,0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'pulse-gold': 'pulse-gold 2.5s cubic-bezier(0.4,0,0.6,1) infinite',
        shimmer: 'shimmer 3s linear infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
