interface CommentIconProps {
  className?: string;
}

export default function CommentIcon({ className }: CommentIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M2 4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5.5L9 22v-4H4a2 2 0 0 1-2-2V4z" />
    </svg>
  );
}
