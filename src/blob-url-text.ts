function readBlobAsText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(typeof reader.result === "string" ? reader.result : ""));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Unable to read Blob content")));
    reader.readAsText(blob);
  });
}

function successfulResourceStatus(status: number): boolean {
  return status === 0 || (status >= 200 && status < 300);
}

function readBlobUrlViaXhr(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.responseType = "text";
    request.addEventListener("load", () => {
      if (successfulResourceStatus(request.status)) resolve(request.responseText ?? "");
      else reject(new Error(`Blob request failed (${request.status})`));
    });
    request.addEventListener("error", () => reject(new Error("Blob request failed")));
    request.send();
  });
}

export function isBlobUrl(url: string): boolean {
  return String(url).trim().toLowerCase().startsWith("blob:");
}

/** Read an object URL without relying solely on Android WebView's Blob XHR support. */
export async function readBlobUrlAsText(url: string, registeredBlob?: Blob): Promise<string> {
  if (!isBlobUrl(url)) throw new Error(`Not a Blob URL: ${url}`);
  if (registeredBlob) return readBlobAsText(registeredBlob);
  return readBlobUrlViaXhr(url);
}
