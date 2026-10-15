type ModelLoader = () => Promise<unknown>;

const modelLoaders = new Map<string, Promise<void>>();

export function ensureFaceModelLoaded(key: string, loaders: ModelLoader[]) {
  const existing = modelLoaders.get(key);
  if (existing) return existing;

  const promise = Promise.all(loaders.map((loader) => loader()))
    .then(() => undefined)
    .catch((error) => {
      modelLoaders.delete(key);
      throw error;
    });
  modelLoaders.set(key, promise);
  return promise;
}
