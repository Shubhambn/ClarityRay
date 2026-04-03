const queue = [];
let active = false;

export function enqueue(task) {
  queue.push(task);
  processQueue();
}

function processQueue() {
  if (active || queue.length === 0) return;
  active = true;

  const task = queue.shift();
  Promise.resolve(task())
    .catch(() => undefined)
    .finally(() => {
      active = false;
      processQueue();
    });
}

export function queueStats() {
  return {
    queued: queue.length,
    active
  };
}
