import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'it.bitpolito.hub', appName: 'BitPolito', webDir: 'dist/client',
  loggingBehavior: 'none',
  server: {androidScheme:'https'},
  android: {allowMixedContent:false},
};
export default config;
