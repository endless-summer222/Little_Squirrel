import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.icanfly.pixeluv',
  appName: 'Little Squirrel',
  webDir: 'dist',
  android: {
    backgroundColor: '#1B1B1D',
  },
  ios: {
    contentInset: 'always',
  },
};

export default config;
