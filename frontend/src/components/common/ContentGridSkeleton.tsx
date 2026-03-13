export default function ContentGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="aspect-[2/3] w-full animate-pulse rounded-xl bg-white/5" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-white/5" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-white/5" />
        </div>
      ))}
    </div>
  );
}
