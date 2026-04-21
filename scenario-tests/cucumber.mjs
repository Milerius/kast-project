export default {
  default: {
    import: ['orchestrator/**/*.ts'],
    loader: ['tsx/esm'],
    paths: ['features/**/*.feature'],
    publishQuiet: true,
  },
  live: {
    import: ['live/**/*.ts'],
    loader: ['tsx/esm'],
    paths: ['features/**/*.feature'],
    tags: '@live',
    publishQuiet: true,
  },
};
