export default function Loading() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4" aria-busy="true" aria-label="טוען…">
      <div className="bg-muted h-8 w-48 animate-pulse rounded-md" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="bg-muted h-24 animate-pulse rounded-xl" />
        ))}
      </div>
      <div className="bg-muted h-80 animate-pulse rounded-xl" />
    </div>
  );
}
