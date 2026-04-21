/** @type {import('next').NextConfig} */
export default {
  transpilePackages: [
    '@kast/shared',
    '@kast/orchestrator',
    '@kast/kamino-adapter',
    '@kast/mayan-adapter',
  ],
};
