const { createWorker } = require('tesseract.js');
(async () => {
  try {
    const worker = await createWorker('eng');
    console.log('worker created OK');
    await worker.terminate();
    console.log('OCR SMOKE TEST: PASS');
  } catch (err) {
    console.error('OCR SMOKE TEST: FAIL', err);
    process.exit(1);
  }
})();
