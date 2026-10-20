// Tells the sidebar trash count to refresh after anything moves into or out of the trash.
const EVENT = 'jsp:trash-changed';
export const notifyTrashChanged = () => window.dispatchEvent(new Event(EVENT));
export function onTrashChanged(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
