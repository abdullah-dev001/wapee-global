import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Unit tests for pure logic only — permission rules, money and time maths, zod
 * schemas. There is no React Native renderer here on purpose: component tests
 * would need the whole Expo/RN transform chain, and the rules worth testing are
 * deliberately kept free of components.
 *
 * `lucide-react-native` is aliased to a stub because `config/navigation.ts`
 * imports icons from it, and pulling in react-native would drag the native
 * runtime into Node.
 */
export default defineConfig({
  resolve: {
    alias: {
      'lucide-react-native': path.resolve(root, 'src/test/stubs/lucideIcons.ts'),
      'expo-localization': path.resolve(root, 'src/test/stubs/expoLocalization.ts'),
      '@': path.resolve(root, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
  },
});
