const FALLBACK_EXTENSIONS = ['.ts', '.tsx', '.js', '.json'];

export async function resolve(specifier, context, defaultResolve) {
  try {
    return await defaultResolve(specifier, context, defaultResolve);
  } catch (error) {
    const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
    const hasExtension = /\.[a-z0-9]+$/i.test(specifier);

    if (!isRelative || hasExtension) {
      throw error;
    }

    for (const extension of FALLBACK_EXTENSIONS) {
      try {
        return await defaultResolve(`${specifier}${extension}`, context, defaultResolve);
      } catch {
        // Try the next extension.
      }
    }

    throw error;
  }
}
