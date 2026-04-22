export default {
  default: {
    import: ['orchestrator/**/*.ts'],
    paths: ['features/**/*.feature'],
    publishQuiet: true,
  },
  live: {
    import: ['live/**/*.ts'],
    paths: ['features/**/*.feature'],
    tags: '@live',
    publishQuiet: true,
  },
};
