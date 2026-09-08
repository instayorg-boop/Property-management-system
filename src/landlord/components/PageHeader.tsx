export default function PageHeader({ title }: { title: string }) {
  return (
    <div className="px-4 pt-5 pb-6 sm:px-8">
      <h1 className="font-display text-xl font-semibold tracking-tight text-brand">{title}</h1>
    </div>
  );
}
