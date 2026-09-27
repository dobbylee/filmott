interface PersonCacheEntry<T> {
  data: T;
  expiresAt: number;
}

/** 인물 JSON 응답의 항목 수와 직렬화 payload 크기를 제한하는 LRU 캐시. */
export class PersonCache<T> {
  private readonly entries = new Map<
    number,
    PersonCacheEntry<T> & { payloadBytes: number }
  >();
  private payloadBytes = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly maxPayloadBytes: number,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  has(key: number): boolean {
    return this.entries.has(key);
  }

  get(key: number): PersonCacheEntry<T> | undefined {
    const entry = this.entries.get(key);
    if (entry) {
      this.entries.delete(key);
      this.entries.set(key, entry);
    }
    return entry;
  }

  set(key: number, entry: PersonCacheEntry<T>): void {
    // JSON byte 예산은 실제 V8 heap 크기와 다르다. 항목 상한도 함께 적용한다.
    const payloadBytes = Buffer.byteLength(JSON.stringify(entry.data), 'utf8');
    this.delete(key);
    if (payloadBytes > this.maxPayloadBytes) return;

    while (
      this.entries.size >= this.maxEntries ||
      this.payloadBytes + payloadBytes > this.maxPayloadBytes
    ) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.delete(oldest.value);
    }
    this.entries.set(key, { ...entry, payloadBytes });
    this.payloadBytes += payloadBytes;
  }

  delete(key: number): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.payloadBytes -= entry.payloadBytes;
    return this.entries.delete(key);
  }

  [Symbol.iterator](): IterableIterator<[number, PersonCacheEntry<T>]> {
    return this.entries.entries();
  }
}
