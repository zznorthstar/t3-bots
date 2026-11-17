const eventName = "t3:create-bot";

export function openNewBot() {
  window.dispatchEvent(new Event(eventName));
}

export function subscribeNewBot(listener: () => void) {
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}
