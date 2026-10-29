export async function openCamera(deviceId?: string): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera requires localhost or a secure connection.');
  return navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 }, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) } });
}
export async function listCameras(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices) return [];
  return (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput');
}
/** Processing follows decoded video frames, including when no animation frames are delivered. */
export function scheduleVideoFrame(video: HTMLVideoElement, callback: () => void): () => void {
  if (typeof video.requestVideoFrameCallback === 'function') {
    const id = video.requestVideoFrameCallback(callback);
    return () => video.cancelVideoFrameCallback(id);
  }
  const id = window.setTimeout(callback, 100);
  return () => window.clearTimeout(id);
}
export function replaySource(): string | null {
  const value = new URLSearchParams(location.search).get('video');
  return value?.startsWith('/fixtures/') && !value.includes('..') && /\.mp4$/i.test(value) ? value : null;
}
