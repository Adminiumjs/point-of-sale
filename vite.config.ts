import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base is supplied on the CLI: `/` for the default build, `/demo/point-of-sale/`
// for the hosted demo (see the `build:demo` script in package.json).
export default defineConfig({
  plugins: [react()],
});
