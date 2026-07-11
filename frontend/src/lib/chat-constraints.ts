export const MAX_CHAT_MESSAGE_LENGTH = 500;

export function truncateChatMessage(value: string): string {
  return Array.from(value).slice(0, MAX_CHAT_MESSAGE_LENGTH).join('');
}
