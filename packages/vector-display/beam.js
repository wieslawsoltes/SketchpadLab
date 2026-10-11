/** Analytic two-lobe electron-beam footprint shared by the CPU sprite and WGSL
 * renderers. This is a tunable visual approximation, NOT a measured TX-2 PSF.
 * Distances/radii are device pixels; scaling keeps CSS-pixel focus stable. */
export function beamEnergy(distance, { focus = 1, scale = 1, intensity = 1 } = {}) {
    if (![distance, focus, scale, intensity].every(Number.isFinite) || distance < 0 || focus < .35 || focus > 1.8 || scale <= 0 || intensity < 0)
        throw new RangeError('Invalid beam profile');
    const glowRadius = 5 * focus * scale, coreRadius = 1.7 * focus * scale;
    return intensity * (.2 * Math.exp(-distance * distance / Math.max(.25, glowRadius * glowRadius * .13)) +
        .95 * Math.exp(-distance * distance / Math.max(.25, coreRadius * coreRadius * .13)));
}
