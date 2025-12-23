export function isTrigger(message, keyword) {
  return message.trim().toLowerCase() === keyword.toLowerCase();
}

export function getArgs(message) {
  return message.trim().split(' ').slice(1);
}
