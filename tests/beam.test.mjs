import test from 'node:test';
import assert from 'node:assert/strict';
import { beamEnergy } from '../packages/vector-display/index.js';

test('beam profile has finite positive peak and decays monotonically with radial distance', () => {
    assert.equal(beamEnergy(0), 1.15);
    let previous = Infinity;
    for (let i = 0; i <= 200; i++) {
        const energy = beamEnergy(i / 10);
        assert(Number.isFinite(energy) && energy >= 0 && energy <= previous);
        previous = energy;
    }
    assert(beamEnergy(20) < 1e-40);
});
test('beam intensity is linear and zero intensity emits no light', () => {
    for (const d of [0, .5, 1, 2, 5]) {
        assert.equal(beamEnergy(d, { intensity: 0 }), 0);
        assert.equal(beamEnergy(d, { intensity: 2 }), 2 * beamEnergy(d));
    }
});
test('focus widens the beam without changing its on-axis energy', () => {
    assert.equal(beamEnergy(0, { focus: .35 }), beamEnergy(0, { focus: 1.8 }));
    assert(beamEnergy(2, { focus: 1.8 }) > beamEnergy(2, { focus: .35 }));
});
test('DPR scaling preserves radial profile when the minimum variance floor is inactive', () => {
    for (const d of [0, .5, 1, 2, 5])
        assert(Math.abs(beamEnergy(d) - beamEnergy(d * 2, { scale: 2 })) < 1e-12);
});
test('invalid optical parameters fail rather than producing NaN draw data', () => {
    for (const d of [NaN, Infinity, -1]) assert.throws(() => beamEnergy(d), RangeError);
    for (const p of [{ focus: 0 }, { focus: 2 }, { focus: NaN }, { scale: 0 }, { scale: Infinity }, { intensity: -1 }])
        assert.throws(() => beamEnergy(1, p), RangeError);
});
