export async function waitForPrintImages(container: HTMLElement, timeoutMs = 3000) {
  await Promise.all(Array.from(container.querySelectorAll("img")).map((image) => {
    if (image.complete) return Promise.resolve();

    return new Promise<void>((resolve) => {
      const finish = () => {
        window.clearTimeout(timeout);
        image.removeEventListener("load", finish);
        image.removeEventListener("error", finish);
        resolve();
      };
      const timeout = window.setTimeout(finish, timeoutMs);
      image.addEventListener("load", finish, { once: true });
      image.addEventListener("error", finish, { once: true });
    });
  }));
}
