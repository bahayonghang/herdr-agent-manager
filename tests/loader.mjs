export async function resolve(specifier, context, nextResolve) {
  const modules = { herdr: './mocks/herdr.mjs', 'gpui-kit': './mocks/gpui-kit.mjs', 'gpui-base': './mocks/gpui-base.mjs' };
  if (modules[specifier]) return { url: new URL(modules[specifier], import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
