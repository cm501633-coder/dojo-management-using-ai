export default {
  expo: {
    name: 'Dojo Management',
    slug: 'dojo-management',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    android: {
      package: 'com.dojomanagement.app',
      usesCleartextTraffic: true
    },
    plugins: ['expo-secure-store']
  }
};
