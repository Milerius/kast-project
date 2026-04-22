/** @type {import('next').NextConfig} */
export default {
  transpilePackages: [
    '@kast/shared',
    '@kast/orchestrator',
    '@kast/kamino-adapter',
    '@kast/mayan-adapter',
  ],
  webpack: (config, { isServer }) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        child_process: false,
      };
    }
    return config;
  },
};
