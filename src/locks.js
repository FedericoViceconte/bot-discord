export class Locks {
  #active = new Set();
  async run(key, work) {
    if (this.#active.has(key)) throw new Error('Ya hay una operación en curso. Esperá un momento. / Please wait.');
    this.#active.add(key);
    try { return await work(); } finally { this.#active.delete(key); }
  }
}
