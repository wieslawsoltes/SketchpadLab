/** Intrusive multi-membership circular rings in a growable typed-array arena.
 * Zero is null. IDs are never reused, avoiding ABA/stale-handle aliasing. */
export class RingArena {
    constructor(capacity = 256) { this.capacity = Math.max(16, capacity); this.count = 0; this.next = new Uint32Array(this.capacity); this.prev = new Uint32Array(this.capacity); this.owner = new Uint32Array(this.capacity); this.value = new Uint32Array(this.capacity); this.alive = new Uint8Array(this.capacity); this.anchor = new Uint8Array(this.capacity); }
    allocate() {
        if (this.count + 1 >= this.capacity) {
            this.capacity *= 2;
            for (const field of ['next', 'prev', 'owner', 'value', 'alive', 'anchor']) {
                const next = new this[field].constructor(this.capacity);
                next.set(this[field]);
                this[field] = next;
            }
        }
        const n = ++this.count;
        this.alive[n] = 1;
        return n;
    }
    create() { const a = this.allocate(); this.anchor[a] = 1; this.next[a] = this.prev[a] = this.owner[a] = a; return a; }
    check(n) {
        if (!Number.isInteger(n) || n < 1 || n > this.count || !this.alive[n])
            throw new Error(`Dead or invalid ring node ${n}`);
    }
    insert(anchor, value, before = anchor) {
        this.check(anchor);
        this.check(before);
        if (!this.anchor[anchor] || this.owner[before] !== anchor)
            throw new Error('Ring ownership mismatch');
        if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
            throw new RangeError('Ring payload must be uint32');
        const n = this.allocate(), p = this.prev[before];
        this.owner[n] = anchor;
        this.value[n] = value;
        this.next[p] = n;
        this.prev[n] = p;
        this.next[n] = before;
        this.prev[before] = n;
        return n;
    }
    remove(n) {
        this.check(n);
        if (this.anchor[n] && this.next[n] !== n)
            throw new Error('Cannot remove nonempty ring anchor');
        this.next[this.prev[n]] = this.next[n];
        this.prev[this.next[n]] = this.prev[n];
        this.alive[n] = 0;
    }
    *nodes(anchor) {
        this.check(anchor);
        if (!this.anchor[anchor])
            throw new Error('Not a ring anchor');
        let n = this.next[anchor], visited = 0;
        while (n !== anchor) {
            this.check(n);
            if (++visited > this.count)
                throw new Error('Broken ring cycle');
            yield n;
            n = this.next[n];
        }
    }
    *values(anchor) {
        for (const n of this.nodes(anchor))
            yield this.value[n];
    }
    validate() {
        for (let n = 1; n <= this.count; n++)
            if (this.alive[n]) {
                if (!this.alive[this.next[n]] || !this.alive[this.prev[n]] || this.prev[this.next[n]] !== n || this.next[this.prev[n]] !== n)
                    throw new Error(`Broken links at ring node ${n}`);
                if (!this.anchor[this.owner[n]] || !this.alive[this.owner[n]])
                    throw new Error(`Dead owner for ${n}`);
            }
        return true;
    }
}
