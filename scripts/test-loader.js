export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') {
    return {
      format: 'module',
      shortCircuit: true,
      url: new URL('./mock-three.js', import.meta.url).href
    };
  }
  if (specifier === 'three/addons/controls/OrbitControls.js') {
    return {
      format: 'module',
      shortCircuit: true,
      url: new URL('./mock-orbit-controls.js', import.meta.url).href
    };
  }
  return nextResolve(specifier, context);
}
