const OPEN_CHAT_URL = 'https://open.kakao.com/o/gF5pAlli';

export default function FloatingOpenChat() {
  return (
    <a
      href={OPEN_CHAT_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Filmott 오픈채팅 참여"
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-50 flex min-h-11 items-center gap-2 rounded-full bg-[#FEE500] px-4 py-2.5 text-sm font-bold text-[#191919] shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FEE500] active:scale-95"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 shrink-0"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 3C6.477 3 2 6.463 2 10.691c0 2.72 1.8 5.108 4.513 6.467-.197.735-.714 2.666-.818 3.08-.128.508.186.501.39.365.161-.107 2.553-1.737 3.583-2.442.767.107 1.554.164 2.332.164 5.523 0 10-3.463 10-7.634C22 6.463 17.523 3 12 3" />
      </svg>
      <span>오픈채팅</span>
    </a>
  );
}
