import { executeVoteCron } from './routes/cron.js';

console.log('[WORKER] Initializing vote cron worker...');

executeVoteCron()
  .then((results) => {
    console.log('[WORKER] Cron execution finished successfully.');
    console.log('[WORKER] Results breakdown:', JSON.stringify(results, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error('[WORKER] Fatal error occurred during cron execution:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
