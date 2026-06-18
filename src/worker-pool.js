/**
 * Pool de workers de conversion. Dimensionné à la concurrence choisie, il
 * distribue les tâches aux workers libres et résout chaque tâche par son id.
 * Un worker qui plante est remplacé automatiquement.
 */
export class WorkerPool {
  constructor(size) {
    this.size = Math.max(1, size);
    this.workers = [];
    this.idle = [];
    this.queue = [];
    this.jobs = new Map();
    this.seq = 0;
  }

  spawn() {
    const worker = new Worker(
      new URL("./convert-worker.js", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (event) => this.onMessage(worker, event.data);
    worker.onerror = (event) => this.onError(worker, event);
    this.workers.push(worker);
    return worker;
  }

  ensure() {
    while (this.workers.length < this.size) {
      this.idle.push(this.spawn());
    }
  }

  run(payload) {
    this.ensure();
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      this.queue.push({ id, payload, resolve, reject });
      this.pump();
    });
  }

  pump() {
    while (this.idle.length && this.queue.length) {
      const worker = this.idle.pop();
      const job = this.queue.shift();
      this.jobs.set(job.id, { ...job, worker });
      worker.postMessage({ id: job.id, ...job.payload });
    }
  }

  onMessage(worker, data) {
    const job = this.jobs.get(data.id);
    if (!job) return;
    this.jobs.delete(data.id);
    this.idle.push(worker);
    if (data.ok) job.resolve(data);
    else job.reject(new Error(data.error || "Erreur worker."));
    this.pump();
  }

  onError(worker, event) {
    for (const [id, job] of this.jobs) {
      if (job.worker === worker) {
        this.jobs.delete(id);
        job.reject(new Error(event.message || "Worker interrompu."));
      }
    }
    this.workers = this.workers.filter((candidate) => candidate !== worker);
    this.idle = this.idle.filter((candidate) => candidate !== worker);
    try {
      worker.terminate();
    } catch {}
    this.pump();
  }

  terminate() {
    for (const worker of this.workers) {
      try {
        worker.terminate();
      } catch {}
    }
    for (const [, job] of this.jobs) {
      job.reject(new Error("Conversion annulée."));
    }
    this.workers = [];
    this.idle = [];
    this.queue = [];
    this.jobs.clear();
  }
}
